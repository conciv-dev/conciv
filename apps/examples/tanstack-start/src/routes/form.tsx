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

function FieldError({errors}: {errors: string[]}) {
  if (!errors.length) return null
  return <em className="mt-1 block text-xs font-medium text-[#c0392b]">{errors.join(', ')}</em>
}

function FormDemo() {
  const [submitted, setSubmitted] = useState<Submission | null>(null)

  const form = useForm({
    defaultValues: DEFAULTS,
    onSubmit: ({value}) => setSubmitted(value),
  })

  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">Page Actions Playground</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          A form with every interaction.
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-[var(--sea-ink-soft)]">
          Built with TanStack Form. Text, number, select, radio, checkbox, range, color, date, textarea, and submit so
          the agent can exercise fill, select, check, click, hover, press, scroll, and submit against real controls.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <form
          aria-label="Demo profile form"
          className="island-shell flex flex-col gap-6 rounded-2xl p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.Field
            name="fullName"
            validators={{
              onChange: ({value}) => (value.trim().length < 2 ? 'Name must be at least 2 characters' : undefined),
            }}
          >
            {(field) => (
              <div className="flex flex-col">
                <label htmlFor={field.name} className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">
                  Full name
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  placeholder="Ada Lovelace"
                  className="form-control"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <FieldError errors={field.state.meta.errors.filter(Boolean) as string[]} />
              </div>
            )}
          </form.Field>

          <form.Field
            name="email"
            validators={{
              onChange: ({value}) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? undefined : 'Enter a valid email'),
            }}
          >
            {(field) => (
              <div className="flex flex-col">
                <label htmlFor={field.name} className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">
                  Email
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="email"
                  placeholder="ada@example.com"
                  className="form-control"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <FieldError errors={field.state.meta.errors.filter(Boolean) as string[]} />
              </div>
            )}
          </form.Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <form.Field name="age">
              {(field) => (
                <div className="flex flex-col">
                  <label htmlFor={field.name} className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">
                    Age
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="number"
                    min={0}
                    max={120}
                    className="form-control"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="role" validators={{onChange: ({value}) => (value ? undefined : 'Pick a role')}}>
              {(field) => (
                <div className="flex flex-col">
                  <label htmlFor={field.name} className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">
                    Role
                  </label>
                  <select
                    id={field.name}
                    name={field.name}
                    className="form-control"
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
                  <FieldError errors={field.state.meta.errors.filter(Boolean) as string[]} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="experience">
            {(field) => (
              <fieldset className="flex flex-col">
                <legend className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">Experience</legend>
                <div className="flex flex-wrap gap-4">
                  {EXPERIENCE.map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
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
              <fieldset className="flex flex-col">
                <legend className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">Skills</legend>
                <div className="flex flex-wrap gap-4">
                  {SKILLS.map((skill) => {
                    const checked = field.state.value.includes(skill)
                    return (
                      <label key={skill} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name={field.name}
                          value={skill}
                          checked={checked}
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
                    )
                  })}
                </div>
              </fieldset>
            )}
          </form.Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <form.Field name="satisfaction">
              {(field) => (
                <div className="flex flex-col">
                  <label htmlFor={field.name} className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">
                    Satisfaction: {field.state.value}/10
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="range"
                    min={0}
                    max={10}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="favoriteColor">
              {(field) => (
                <div className="flex flex-col">
                  <label htmlFor={field.name} className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">
                    Favorite color
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="color"
                    className="h-10 w-20 cursor-pointer rounded-lg border border-[var(--line)] bg-transparent"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="birthday">
            {(field) => (
              <div className="flex flex-col">
                <label htmlFor={field.name} className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">
                  Birthday
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="date"
                  className="form-control"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="bio">
            {(field) => (
              <div className="flex flex-col">
                <label htmlFor={field.name} className="mb-1.5 text-sm font-semibold text-[var(--sea-ink)]">
                  Bio
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  rows={4}
                  placeholder="Tell us about yourself…"
                  className="form-control resize-y"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="newsletter">
            {(field) => (
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name={field.name}
                  checked={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.checked)}
                />
                Subscribe to the newsletter
              </label>
            )}
          </form.Field>

          <form.Field
            name="terms"
            validators={{onChange: ({value}) => (value ? undefined : 'You must accept the terms')}}
          >
            {(field) => (
              <div className="flex flex-col">
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name={field.name}
                    checked={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.checked)}
                  />
                  I accept the terms and conditions
                </label>
                <FieldError errors={field.state.meta.errors.filter(Boolean) as string[]} />
              </div>
            )}
          </form.Field>

          <div className="flex flex-wrap gap-3 pt-2">
            <form.Subscribe selector={(state) => ({canSubmit: state.canSubmit, isSubmitting: state.isSubmitting})}>
              {({canSubmit, isSubmitting}) => (
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.18)] px-6 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting…' : 'Submit'}
                </button>
              )}
            </form.Subscribe>
            <button
              type="button"
              className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-6 py-2.5 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
              onClick={() => {
                form.reset()
                setSubmitted(null)
              }}
            >
              Reset
            </button>
          </div>
        </form>

        <aside className="island-shell h-fit rounded-2xl p-6 lg:sticky lg:top-24" aria-label="Live form state">
          <p className="island-kicker mb-3">Live state</p>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <pre className="m-0 max-h-72 overflow-auto rounded-xl bg-[rgba(23,58,64,0.06)] p-4 text-xs leading-5 text-[var(--sea-ink)]">
                {JSON.stringify(values, null, 2)}
              </pre>
            )}
          </form.Subscribe>

          <p className="island-kicker mb-3 mt-6">Last submission</p>
          {submitted ? (
            <pre
              data-testid="submission-result"
              className="m-0 max-h-72 overflow-auto rounded-xl bg-[rgba(79,184,178,0.14)] p-4 text-xs leading-5 text-[var(--lagoon-deep)]"
            >
              {JSON.stringify(submitted, null, 2)}
            </pre>
          ) : (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">Submit the form to see the payload here.</p>
          )}
        </aside>
      </div>
    </main>
  )
}
