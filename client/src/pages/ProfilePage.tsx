import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Trash2, MailWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/context/AuthContext'
import * as authApi from '@/lib/api/auth'
import { parseApiError } from '@/lib/api/errors'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^(0|\+94|94)?7[0-9]{8}$/

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, updateProfile, logout } = useAuth()
  const { toast } = useToast()

  React.useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  const [name, setName] = React.useState(user?.name ?? '')
  const [email, setEmail] = React.useState(user?.email ?? '')
  const [phone, setPhone] = React.useState(user?.phone ?? '')
  const [profileError, setProfileError] = React.useState('')
  const [savingProfile, setSavingProfile] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [resending, setResending] = React.useState(false)

  if (!user) return null

  const resendVerification = async () => {
    setResending(true)
    try {
      const { message } = await authApi.resendVerification()
      toast(message || 'Verification email sent.', 'success')
    } catch (err) {
      toast(parseApiError(err).message, 'error')
    } finally {
      setResending(false)
    }
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) {
      setProfileError('Name must be at least 2 characters.')
      return
    }
    if (!EMAIL_RE.test(email)) {
      setProfileError('Enter a valid email address.')
      return
    }
    if (!PHONE_RE.test(phone.replace(/\s/g, ''))) {
      setProfileError('Enter a valid Sri Lankan mobile number, e.g. 0771234567.')
      return
    }
    setProfileError('')
    setSavingProfile(true)
    try {
      await updateProfile({ name: name.trim(), email, phone: phone.trim() })
      toast('Profile updated.', 'success')
    } catch (err) {
      setProfileError(parseApiError(err).message)
    } finally {
      setSavingProfile(false)
    }
  }

  const deleteAccount = async () => {
    setDeleting(true)
    try {
      await authApi.deleteMe()
      logout()
      navigate('/')
    } catch (err) {
      toast(parseApiError(err).message, 'error')
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <div className="mb-8">
        <p className="eyebrow text-stamp-red">Account</p>
        <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">
          Your profile
        </h1>
        <p className="mt-1 text-text-secondary">
          Manage your name, email, and phone number.
        </p>
      </div>

      {/* Email verification notice — absent entirely for a verified user (or
          when `emailVerified` is missing on stale cached state); see
          userSerializer's current gap around this field noted in types.ts. */}
      {user.emailVerified === false && (
        <section className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] border-[0.5px] border-[var(--status-pending-fg)]/30 bg-[var(--status-pending-bg)] p-5">
          <MailWarning className="mt-0.5 size-4 shrink-0 text-[var(--status-pending-fg)]" />
          <div className="flex-1">
            <p className="text-[14px] font-medium text-[var(--status-pending-fg)]">
              Your email isn't verified yet
            </p>
            <p className="mt-1 text-[13px] text-text-secondary">
              Verify it to book tickets.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={resendVerification}
              isLoading={resending}
            >
              Resend verification email
            </Button>
          </div>
        </section>
      )}

      {/* Profile section */}
      <section className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-[16px] font-medium">
          <User className="size-4 text-text-muted" />
          Personal details
        </h2>
        <form onSubmit={saveProfile} noValidate className="mt-5 flex flex-col gap-4">
          <Input
            label="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@email.com"
          />
          <Input
            label="Mobile number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0771234567"
          />
          {profileError && (
            <p role="alert" className="text-[13px] text-destructive">
              {profileError}
            </p>
          )}
          <Button type="submit" size="md" isLoading={savingProfile} className="self-start">
            Save details
          </Button>
        </form>
      </section>

      {/* Password out of scope — no password endpoint exists on the server;
          the build spec explicitly scopes password change out for this
          coursework baseline. */}

      {/* Danger zone */}
      <section className="mt-5 rounded-[var(--radius-card)] border-[0.5px] border-stamp-red/20 bg-card p-6">
        <h2 className="flex items-center gap-2 text-[16px] font-medium text-stamp-red">
          <Trash2 className="size-4" />
          Delete account
        </h2>
        <p className="mt-2 text-[14px] text-text-secondary">
          Permanently removes your account and anonymises your booking history. This cannot be undone.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 text-stamp-red hover:text-stamp-red"
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete account
        </Button>
      </section>

      <Modal
        open={showDeleteConfirm}
        onClose={() => !deleting && setShowDeleteConfirm(false)}
        title="Delete your account?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={deleteAccount} isLoading={deleting}>
              Yes, delete my account
            </Button>
          </>
        }
      >
        <p>
          This permanently removes your account and anonymises your booking history. This cannot
          be undone.
        </p>
      </Modal>

      {/* Email contact link */}
      <div className="mt-6 flex items-center gap-2 text-[13px] text-text-muted">
        <Mail className="size-3.5" />
        <a href="mailto:support@encore.live" className="hover:text-foreground underline-offset-2 hover:underline">
          support@encore.live
        </a>
        <span>· We're here if you need help.</span>
      </div>
    </div>
  )
}
