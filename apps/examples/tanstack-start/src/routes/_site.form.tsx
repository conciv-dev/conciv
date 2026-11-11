import type {ReactNode} from 'react'
import {useState} from 'react'
import {createFileRoute} from '@tanstack/react-router'
import {useForm} from '@tanstack/react-form'

export const Route = createFileRoute('/form')({component: FormDemo})

type Submission = {
  fullName: string
  email: string
  age: number
  role: string
  experience: string
  bio: string
  skills: string[]
  satisfaction: number
  favoriteColor: string
  birthday: string
  newsletter: boolean
  terms: boolean
}

const DEFAULTS: Submission = {
  fullName: '',
  email: '',
  age: 18,
  role: '',
  experience: 'junior',
  bio: '',
  skills: [],
  satisfaction: 5,
  favoriteColor: '#4fb8b2',
  birthday: '',
  newsletter: false,
  terms: false,
}

const ROLES = ['Frontend', 'Backend', 'Full Stack', 'Design', 'Product']
const EXPERIENCE = [
  {value: 'junior', label: 'Junior (0-2 yrs)'},
  {value: 'mid', label: 'Mid (2-5 yrs)'},
  {value: 'senior', label: 'Senior (5+ yrs)'},
]
const SKILLS = ['React', 'TypeScript', 'CSS', 'Node', 'Testing']
const CONTROL_TYPES = ['text', 'email', 'number', 'select', 'radio', 'checkbox', 'range', 'color', 'date', 'textarea']

function FieldError({errors}: {errors: string[]}) {
  if (!errors.length) return null
  return <em className="field-error">{errors.join(', ')}</em>
}

function Section({index, title, hint, children}: {index: string; title: string; hint: string; children: ReactNode}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="section-head">
        <div className="flex items-center gap-2.5">
          <span className="section-index">{index}</span>
          <h2 className="section-title">{title}</h2>
        </div>
        <p className="section-hint">{hint}</p>
      </div>
      {children}
    </section>
  )
}

function FieldShell({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor?: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="field-label">
          {label}
        </label>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function FormDemo() {
  const [submitted, setSubmitted] = useState<Submission | null>(null)

  const form = useForm({
    defaultValues: DEFAULTS,
    onSubmit: ({value}) => setSubmitted(value),
  })

  return (
    <main className="page-wrap px-4 pb-10 pt-10 sm:pt-14">
      <section className="island-shell rise-in relative overflow-hidden rounded-[1.75rem] px-6 py-8 sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_68%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-center">
          <div>
            <span className="eyebrow mb-4">
              <span className="eyebrow-dot" />
              Page actions playground
            </span>
            <h1 className="display-title mb-3 max-w-[16ch] text-4xl font-bold text-[var(--sea-ink)] sm:text-[3.25rem]">
              A form with every interaction.
            </h1>
            <p className="lede m-0 max-w-[46ch]">
              Built with TanStack Form. Every native control on one screen so the agent can exercise fill, select,
              check, click, hover, press, scroll, and submit against real inputs.
            </p>
          </div>
          <div className="island-shell rounded-[1.25rem] p-4 sm:p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <p className="island-kicker m-0">Controls on this page</p>
              <span className="field-hint">{CONTROL_TYPES.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CONTROL_TYPES.map((type) => (
                <span key={type} className="pill mono">
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <form
          aria-label="Demo profile form"
          className="island-shell island-raised flex flex-col gap-8 rounded-[1.5rem] p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <Section index="1" title="Identity" hint="Text, email, number, and select">
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field
                name="fullName"
                validators={{
                  onChange: ({value}) => (value.trim().length < 2 ? 'Name must be at least 2 characters' : undefined),
                }}
              >
                {(field) => {
                  const errors = field.state.meta.errors.filter(Boolean) as string[]
                  return (
                    <FieldShell htmlFor={field.name} label="Full name">
                      <input
                        id={field.name}
                        name={field.name}
                        type="text"
                        placeholder="Ada Lovelace"
                        className="form-control"
                        aria-invalid={errors.length > 0}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldError errors={errors} />
                    </FieldShell>
                  )
                }}
              </form.Field>

              <form.Field
                name="email"
                validators={{
                  onChange: ({value}) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? undefined : 'Enter a valid email'),
                }}
              >
                {(field) => {
                  const errors = field.state.meta.errors.filter(Boolean) as string[]
                  return (
                    <FieldShell htmlFor={field.name} label="Email">
                      <input
                        id={field.name}
                        name={field.name}
                        type="email"
                        placeholder="ada@example.com"
                        className="form-control"
                        aria-invalid={errors.length > 0}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldError errors={errors} />
                    </FieldShell>
                  )
                }}
              </form.Field>

              <form.Field name="age">
                {(field) => (
                  <FieldShell htmlFor={field.name} label="Age" hint="0–120">
                    <input
                      id={field.name}
                      name={field.name}
                      type="number"
                      min={0}
                      max={120}
                      className="form-control mono"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                    />
                  </FieldShell>
                )}
              </form.Field>

              <form.Field name="role" validators={{onChange: ({value}) => (value ? undefined : 'Pick a role')}}>
                {(field) => {
                  const errors = field.state.meta.errors.filter(Boolean) as string[]
                  return (
                    <FieldShell htmlFor={field.name} label="Role">
                      <select
                        id={field.name}
                        name={field.name}
                        className="form-control form-select"
                        aria-invalid={errors.length > 0}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      >
                        <option value="">Select a role…</option>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <FieldError errors={errors} />
                    </FieldShell>
                  )
                }}
              </form.Field>
            </div>
          </Section>

          <Section index="2" title="Craft" hint="Radio group and checkbox group">
            <form.Field name="experience">
              {(field) => (
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="field-label mb-1 p-0">Experience</legend>
                  <div className="flex flex-wrap gap-2">
                    {EXPERIENCE.map((opt) => (
                      <label key={opt.value} className="choice">
                        <input
                          type="radio"
                          className="choice-input"
                          name={field.name}
                          value={opt.value}
                          checked={field.state.value === opt.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </form.Field>

            <form.Field name="skills">
              {(field) => (
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="field-label mb-1 p-0">Skills</legend>
                  <div className="flex flex-wrap gap-2">
                    {SKILLS.map((skill) => (
                      <label key={skill} className="choice">
                        <input
                          type="checkbox"
                          className="choice-input"
                          name={field.name}
                          value={skill}
                          checked={field.state.value.includes(skill)}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(
                              e.target.checked
                                ? [...field.state.value, skill]
                                : field.state.value.filter((s) => s !== skill),
                            )
                          }
                        />
                        {skill}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </form.Field>
          </Section>

          <Section index="3" title="Preferences" hint="Range, color, and date">
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="satisfaction">
                {(field) => (
                  <FieldShell htmlFor={field.name} label="Satisfaction" hint={`${field.state.value} / 10`}>
                    <div className="flex flex-col gap-1 pt-1">
                      <input
                        id={field.name}
                        name={field.name}
                        type="range"
                        min={0}
                        max={10}
                        className="range-control"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                      />
                      <div className="range-scale">
                        <span>0</span>
                        <span>10</span>
                      </div>
                    </div>
                  </FieldShell>
                )}
              </form.Field>

              <form.Field name="birthday">
                {(field) => (
                  <FieldShell htmlFor={field.name} label="Birthday">
                    <input
                      id={field.name}
                      name={field.name}
                      type="date"
                      className="form-control mono"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </FieldShell>
                )}
              </form.Field>

              <form.Field name="favoriteColor">
                {(field) => (
                  <FieldShell htmlFor={field.name} label="Favorite color">
                    <div className="flex items-center gap-3">
                      <input
                        id={field.name}
                        name={field.name}
                        type="color"
                        className="color-control"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <span className="mono text-sm font-semibold uppercase text-[var(--sea-ink-soft)]">
                        {field.state.value}
                      </span>
                    </div>
                  </FieldShell>
                )}
              </form.Field>
            </div>
          </Section>

          <Section index="4" title="About you" hint="Multi-line text">
            <form.Field name="bio">
              {(field) => (
                <FieldShell htmlFor={field.name} label="Bio" hint={`${field.state.value.length} characters`}>
                  <textarea
                    id={field.name}
                    name={field.name}
                    rows={4}
                    placeholder="Tell us about yourself…"
                    className="form-control form-textarea"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </FieldShell>
              )}
            </form.Field>
          </Section>

          <Section index="5" title="Consent" hint="Required before submitting">
            <div className="grid gap-2.5">
              <form.Field name="newsletter">
                {(field) => (
                  <label className="choice choice-block">
                    <input
                      type="checkbox"
                      className="choice-input mt-0.5"
                      name={field.name}
                      checked={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.checked)}
                    />
                    <span>
                      <span className="choice-title">Subscribe to the newsletter</span>
                      <span className="choice-sub">Occasional product notes. Optional.</span>
                    </span>
                  </label>
                )}
              </form.Field>

              <form.Field
                name="terms"
                validators={{onChange: ({value}) => (value ? undefined : 'You must accept the terms')}}
              >
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <label className="choice choice-block">
                      <input
                        type="checkbox"
                        className="choice-input mt-0.5"
                        name={field.name}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.checked)}
                      />
                      <span>
                        <span className="choice-title">I accept the terms and conditions</span>
                        <span className="choice-sub">Required. Validation runs as soon as you touch the field.</span>
                      </span>
                    </label>
                    <FieldError errors={field.state.meta.errors.filter(Boolean) as string[]} />
                  </div>
                )}
              </form.Field>
            </div>
          </Section>

          <form.Subscribe selector={(state) => ({canSubmit: state.canSubmit, isSubmitting: state.isSubmitting})}>
            {({canSubmit, isSubmitting}) => (
              <div className="form-actions">
                <span className={canSubmit ? 'status-note status-ready' : 'status-note'}>
                  <span className="status-dot" />
                  {canSubmit ? 'Ready to submit' : 'Fix the highlighted fields'}
                </span>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      form.reset()
                      setSubmitted(null)
                    }}
                  >
                    Reset
                  </button>
                  <button type="submit" disabled={!canSubmit} className="btn btn-primary">
                    {isSubmitting ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </form.Subscribe>
        </form>

        <aside
          className="island-shell flex h-fit flex-col gap-5 rounded-[1.5rem] p-5 sm:p-6 lg:sticky lg:top-24"
          aria-label="Live form state"
        >
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="island-kicker m-0">Live state</p>
              <span className="pill mono">updates on change</span>
            </div>
            <form.Subscribe selector={(state) => state.values}>
              {(values) => <pre className="code-block max-h-72">{JSON.stringify(values, null, 2)}</pre>}
            </form.Subscribe>
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="island-kicker m-0">Last submission</p>
              {submitted ? <span className="pill mono">captured</span> : null}
            </div>
            {submitted ? (
              <pre data-testid="submission-result" className="code-block code-block-accent max-h-72">
                {JSON.stringify(submitted, null, 2)}
              </pre>
            ) : (
              <p className="empty-slot m-0">Submit the form to see the payload here.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}
