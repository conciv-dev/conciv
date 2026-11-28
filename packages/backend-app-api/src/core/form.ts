import * as Form from '@conciv/protocol/schema/form'
import * as Identifier from '@conciv/protocol/schema/identifier'
import {formErrors} from '@conciv/errors'
import type {EvlogError} from 'evlog'
import {Cache, Context, Deferred, Duration, Effect, Exit, Layer, Option} from 'effect'
import * as Bus from './bus.js'

const RETENTION = Duration.minutes(10)

export const Id = Form.Id
export type Id = typeof Id.Type

export const Info = Form.Info
export type Info = typeof Info.Type

export const Field = Form.Field
export type Field = Form.Field

export const Fields = Form.Fields
export type Fields = Form.Fields

export const When = Form.When
export type When = Form.When

export const State = Form.State
export type State = typeof State.Type
export type TerminalState = Exclude<State, {readonly status: 'pending'}>

export const Answer = Form.Answer
export type Answer = typeof Answer.Type

export const Reply = Form.Reply
export type Reply = typeof Reply.Type

export const Event = Form.Event

export type CreateInput = Omit<Form.Info, 'id'> & {readonly id?: Id}

export interface ReplyInput {
  readonly id: Id
  readonly answer: Answer
}

export interface CancelOptions {
  readonly message?: string
}

export interface ListInput {
  readonly sessionId?: Form.Info['sessionId']
}

export interface Interface {
  readonly close: Effect.Effect<void>
  readonly create: (input: CreateInput) => Effect.Effect<Info, EvlogError>
  readonly ask: (input: CreateInput) => Effect.Effect<TerminalState, EvlogError>
  readonly get: (id: Id) => Effect.Effect<Info, EvlogError>
  readonly list: (input?: ListInput) => Effect.Effect<ReadonlyArray<Info>>
  readonly state: (id: Id) => Effect.Effect<State, EvlogError>
  readonly reply: (input: ReplyInput) => Effect.Effect<void, EvlogError>
  readonly cancel: (id: Id, options?: CancelOptions) => Effect.Effect<void, EvlogError>
}

export const Service = Context.Service<Interface>('@conciv/Form')

interface Entry {
  readonly form: Info
  readonly state: State
  readonly deferred: Deferred.Deferred<TerminalState>
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const ids = yield* Identifier.Service
    const lifecycle = {closed: false}
    const forms = yield* Cache.makeWith<Id, Entry>(
      () => Effect.die(new Error('Form cache must be used via set/getSuccess, never get')),
      {
        capacity: Number.MAX_SAFE_INTEGER,
        timeToLive: (exit) =>
          Exit.isSuccess(exit) && exit.value.state.status === 'pending' ? Duration.infinity : RETENTION,
      },
    )

    const requireEntry = Effect.fn('Form.requireEntry')((id: Id) =>
      Cache.getSuccess(forms, id).pipe(
        Effect.flatMap((entry) => Effect.fromOption(entry, () => formErrors.NOT_FOUND({id}))),
      ),
    )

    const create = Effect.fn('Form.create')((input: CreateInput) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const id = input.id ?? Id.create(ids)
          const existing = yield* Cache.getSuccess(forms, id)
          if (Option.isSome(existing)) return yield* Effect.fail(formErrors.ALREADY_EXISTS({id}))
          const invalid = validateFields(input.fields)
          if (invalid) return yield* Effect.fail(formErrors.INVALID_FORM({reason: invalid}))
          const form: Info = {
            id,
            sessionId: input.sessionId,
            title: input.title,
            ...(input.metadata === undefined ? {} : {metadata: input.metadata}),
            fields: input.fields,
          }
          const entry: Entry = {
            form,
            state: {status: 'pending'},
            deferred: yield* Deferred.make<TerminalState>(),
          }
          yield* Cache.set(forms, id, entry)
          yield* bus.publish(Form.Event.Created, {form}).pipe(Effect.onError(() => Cache.invalidate(forms, id)))
          if (lifecycle.closed) yield* cancel(id).pipe(Effect.orDie)
          return form
        }),
      ),
    )

    const ask = Effect.fn('Form.ask')((input: CreateInput) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const form = yield* create(input)
          const entry = yield* requireEntry(form.id).pipe(Effect.orDie)
          return yield* restore(Deferred.await(entry.deferred)).pipe(
            Effect.onInterrupt(() => Effect.ignore(cancel(form.id))),
          )
        }),
      ),
    )

    const get = Effect.fn('Form.get')(function* (id: Id) {
      return (yield* requireEntry(id)).form
    })

    const list = Effect.fn('Form.list')(function* (input?: ListInput) {
      const entries = yield* Cache.values(forms)
      return Array.from(entries)
        .filter((entry) => entry.state.status === 'pending')
        .filter((entry) => input?.sessionId === undefined || entry.form.sessionId === input.sessionId)
        .map((entry) => entry.form)
    })

    const state = Effect.fn('Form.state')(function* (id: Id) {
      return (yield* requireEntry(id)).state
    })

    const reply = Effect.fn('Form.reply')((input: ReplyInput) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const entry = yield* requireEntry(input.id)
          if (entry.state.status !== 'pending') return yield* Effect.fail(formErrors.ALREADY_SETTLED({id: input.id}))
          const invalid = validateAnswer(entry.form.fields, input.answer)
          if (invalid) return yield* Effect.fail(formErrors.INVALID_ANSWER({reason: invalid}))
          const next: TerminalState = {status: 'answered', answer: input.answer}
          yield* bus.publish(Form.Event.Replied, {
            id: input.id,
            sessionId: entry.form.sessionId,
            answer: input.answer,
          })
          yield* Cache.set(forms, input.id, {...entry, state: next})
          yield* Deferred.succeed(entry.deferred, next)
        }),
      ),
    )

    const cancel = Effect.fn('Form.cancel')((id: Id, options?: CancelOptions) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const entry = yield* requireEntry(id)
          if (entry.state.status !== 'pending') return yield* Effect.fail(formErrors.ALREADY_SETTLED({id}))
          const next: TerminalState = {
            status: 'cancelled',
            ...(options?.message === undefined ? {} : {message: options.message}),
          }
          yield* bus.publish(Form.Event.Cancelled, {id, sessionId: entry.form.sessionId})
          yield* Cache.set(forms, id, {...entry, state: next})
          yield* Deferred.succeed(entry.deferred, next)
        }),
      ),
    )

    const close = Effect.sync(() => {
      lifecycle.closed = true
    }).pipe(
      Effect.andThen(Cache.values(forms)),
      Effect.flatMap((entries) =>
        Effect.forEach(
          Array.from(entries).filter((entry) => entry.state.status === 'pending'),
          (entry) => cancel(entry.form.id).pipe(Effect.ignore),
          {discard: true},
        ),
      ),
    )
    yield* Effect.addFinalizer(() => close)

    return Service.of({create, ask, get, list, state, reply, cancel, close})
  }),
)

export function validateAnswer(form: ReadonlyArray<Form.Field>, answer: Answer) {
  const fields = new Map(form.map((field) => [field.key, field] as const))
  for (const key of Object.keys(answer)) {
    if (!fields.has(key)) return `Unknown form field: ${key}`
  }
  for (const field of form) {
    const value = answer[field.key]
    if (field.type === 'external') {
      if (value !== true) return `External form field must be acknowledged: ${field.key}`
      continue
    }
    const active = isActive(field, answer)
    if (value === undefined) {
      if (field.required && active) return `Missing required form field: ${field.key}`
      continue
    }
    if (!active) return `Form field is not active: ${field.key}`
    const invalid = validateField(field, value)
    if (invalid) return invalid
  }
}

type InputField = Exclude<Form.Field, Form.ExternalField>

function isActive(field: InputField, answer: Answer) {
  if (!field.when) return true
  return field.when.every((when) => matches(when, answer[when.key]))
}

function matches(when: Form.When, value: Form.Value | undefined) {
  if (value === undefined) return false
  const hit = Array.isArray(value) ? value.some((item) => item === when.value) : value === when.value
  return when.op === 'eq' ? hit : !hit
}

export function validateFields(fields: ReadonlyArray<Form.Field>) {
  if (fields.length === 0) return 'Form must have at least one field'
  const earlier = new Map<string, InputField>()
  const keys = new Set<string>()
  for (const field of fields) {
    if (keys.has(field.key)) return `Duplicate form field key: ${field.key}`
    keys.add(field.key)
    if (field.type === 'external') continue
    for (const when of field.when ?? []) {
      const target = earlier.get(when.key)
      if (!target) return `Form field condition must reference an earlier field: ${field.key} -> ${when.key}`
      const invalid = validateWhen(when, target)
      if (invalid) return `${invalid}: ${field.key} -> ${when.key}`
    }
    earlier.set(field.key, field)
  }
}

function validateWhen(when: Form.When, target: InputField) {
  if (target.type === 'boolean') {
    if (typeof when.value !== 'boolean') return 'Form field condition value must be a boolean'
    return
  }
  if (target.type === 'number' || target.type === 'integer') {
    if (typeof when.value !== 'number') return 'Form field condition value must be a number'
    return
  }
  if (typeof when.value !== 'string') return 'Form field condition value must be a string'
  const closed = target.type === 'multiselect' ? !target.custom : target.options !== undefined && !target.custom
  if (closed && !target.options?.some((option) => option.value === when.value)) {
    return "Form field condition value must be one of the field's options"
  }
}

function validateField(field: InputField, value: Form.Value): string | undefined {
  if (field.type === 'string') return validateString(field, value)
  if (field.type === 'number' || field.type === 'integer') return validateNumber(field, value)
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') return `Expected boolean for form field: ${field.key}`
    return
  }
  return validateMultiselect(field, value)
}

function validateString(field: Form.StringField, value: Form.Value): string | undefined {
  if (typeof value !== 'string') return `Expected string for form field: ${field.key}`
  if (field.required && value.length === 0) return `Missing required form field: ${field.key}`
  if (field.minLength !== undefined && value.length < field.minLength) return `Form field is too short: ${field.key}`
  if (field.maxLength !== undefined && value.length > field.maxLength) return `Form field is too long: ${field.key}`
  if (field.pattern !== undefined) {
    const pattern = compilePattern(field.pattern)
    if (pattern === undefined) return `Form field has invalid pattern: ${field.key}`
    if (!pattern.test(value)) return `Form field does not match pattern: ${field.key}`
  }
  const format = field.format === undefined ? undefined : formatError(field.format, value)
  if (format !== undefined) return `${format} for form field: ${field.key}`
  if (field.options && !field.custom && !field.options.some((option) => option.value === value)) {
    return `Invalid option for form field: ${field.key}`
  }
}

function formatError(format: NonNullable<Form.StringField['format']>, value: string) {
  if (format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Expected email'
  if (format === 'uri' && !URL.canParse(value)) return 'Expected URI'
  if (format === 'date' && !isDate(value)) return 'Expected date'
  if (format === 'date-time' && !isDateTime(value)) return 'Expected date-time'
  return undefined
}

function validateNumber(field: Form.NumberField | Form.IntegerField, value: Form.Value): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return `Expected number for form field: ${field.key}`
  if (field.type === 'integer' && !Number.isInteger(value)) return `Expected integer for form field: ${field.key}`
  if (field.minimum !== undefined && value < field.minimum) return `Form field is too small: ${field.key}`
  if (field.maximum !== undefined && value > field.maximum) return `Form field is too large: ${field.key}`
}

function validateMultiselect(field: Form.MultiselectField, value: Form.Value): string | undefined {
  if (!isStringArray(value)) return `Expected string array for form field: ${field.key}`
  if (field.required && value.length === 0) return `Missing required form field: ${field.key}`
  if (field.minItems !== undefined && value.length < field.minItems)
    return `Too few selections for form field: ${field.key}`
  if (field.maxItems !== undefined && value.length > field.maxItems)
    return `Too many selections for form field: ${field.key}`
  if (!field.custom && value.some((item) => !field.options.some((option) => option.value === item))) {
    return `Invalid option for form field: ${field.key}`
  }
}

function compilePattern(pattern: string) {
  return Effect.runSync(
    Effect.try(() => new RegExp(pattern)).pipe(
      Effect.match({onFailure: () => undefined, onSuccess: (compiled) => compiled}),
    ),
  )
}

function isStringArray(value: Form.Value): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isDateTime(value: string) {
  return !Number.isNaN(new Date(value).getTime())
}
