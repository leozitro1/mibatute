# MiBatute Supabase Email Templates

Copy these templates into Supabase Dashboard under:

Authentication > Emails > Templates

Suggested subjects:

- Confirm signup: `Confirma tu cuenta en MiBatute`
- Reset password: `Restablece tu contraseña de MiBatute`
- Magic Link / OTP: `Tu acceso a MiBatute`

The templates use Supabase Auth variables documented by Supabase:

- `{{ .ConfirmationURL }}`
- `{{ .Token }}`
- `{{ .SiteURL }}`
- `{{ .Email }}`

Keep Resend click tracking disabled for auth emails so confirmation links are not rewritten.
