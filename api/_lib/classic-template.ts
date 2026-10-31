import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import { createElement as h } from 'react'
import QRCode from 'qrcode'

export interface CertificateData {
  code: string
  student_name: string
  course_title: string
  hours: number | null
  grade: number | null
  instructor_name: string | null
  issued_at: string
  issuer_snapshot: unknown
  template_snapshot: unknown
}

export interface Signer {
  name: string
  title: string
  signature_path: string | null
}

export function parseSigners(v: unknown): Signer[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return []
  const list = (v as Record<string, unknown>).signers
  if (!Array.isArray(list)) return []
  return list
    .map((i) => asRecord(i))
    .filter((i) => typeof i.name === 'string' && i.name !== '')
    .slice(0, 2)
    .map((i) => ({
      name: String(i.name),
      title: typeof i.title === 'string' ? i.title : '',
      signature_path:
        typeof i.signature_path === 'string' && i.signature_path !== ''
          ? i.signature_path
          : null,
    }))
}

interface Issuer {
  kind: 'school' | 'client'
  name: string
  logo_url?: string | null
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function formatDateEs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

const HEX = /^#[0-9a-fA-F]{6}$/
function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value : fallback
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
}

function parseIssuers(v: unknown): Issuer[] {
  if (!Array.isArray(v)) return []
  return v
    .map((i) => asRecord(i))
    .filter((i) => typeof i.name === 'string' && i.name !== '')
    .map((i) => ({
      kind: i.kind === 'client' ? 'client' : 'school',
      name: String(i.name),
      logo_url: typeof i.logo_url === 'string' ? i.logo_url : null,
    }))
}

/** Descarga un logo PNG/JPG; devuelve null ante cualquier fallo (el logo es opcional). */
async function fetchLogo(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !/^https:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!/image\/(png|jpe?g)/i.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 0 && buf.length <= 2_000_000 ? buf : null
  } catch {
    return null
  }
}

export async function renderClassicCertificate(
  data: CertificateData,
  verifyUrl: string,
  signatureImages: Record<string, Buffer> = {},
): Promise<Buffer> {
  const tpl = asRecord(data.template_snapshot)
  const primary = color(tpl.primary_color, '#1e3a8a')
  const secondary = color(tpl.secondary_color, '#b45309')
  const title =
    typeof tpl.title === 'string' && tpl.title !== ''
      ? tpl.title
      : 'Certificado de aprobación'
  const issuers = parseIssuers(data.issuer_snapshot)
  const signers = parseSigners(data.template_snapshot)
  const school = issuers.find((i) => i.kind === 'school')

  const [qrDataUrl, logo] = await Promise.all([
    QRCode.toDataURL(verifyUrl, {
      margin: 0,
      width: 240,
      errorCorrectionLevel: 'M',
    }),
    fetchLogo(school?.logo_url),
  ])

  const styles = StyleSheet.create({
    page: { backgroundColor: '#ffffff', padding: 28 },
    outer: { flex: 1, borderWidth: 3, borderColor: primary, padding: 5 },
    inner: {
      flex: 1,
      borderWidth: 1,
      borderColor: secondary,
      paddingHorizontal: 44,
      paddingVertical: 34,
      alignItems: 'center',
    },
    issuers: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    logo: { height: 38, objectFit: 'contain' },
    issuerName: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 12,
      color: primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontFamily: 'Times-Bold',
      fontSize: 34,
      color: primary,
      marginTop: 30,
      textAlign: 'center',
    },
    rule: { width: 90, height: 2, backgroundColor: secondary, marginTop: 8 },
    lead: {
      fontFamily: 'Helvetica',
      fontSize: 11,
      color: '#475569',
      marginTop: 34,
    },
    name: {
      fontFamily: 'Times-BoldItalic',
      fontSize: 36,
      color: '#0f172a',
      marginTop: 8,
      textAlign: 'center',
    },
    body: {
      fontFamily: 'Helvetica',
      fontSize: 11,
      color: '#475569',
      marginTop: 12,
      textAlign: 'center',
    },
    course: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 20,
      color: '#0f172a',
      marginTop: 10,
      textAlign: 'center',
    },
    meta: {
      fontFamily: 'Helvetica',
      fontSize: 10.5,
      color: '#334155',
      marginTop: 18,
      textAlign: 'center',
    },
    footer: {
      marginTop: 'auto',
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    signers: { flexDirection: 'row', gap: 16, alignItems: 'flex-end' },
    sign: { width: 180, alignItems: 'center' },
    signImage: { height: 46, width: 150, objectFit: 'contain', marginBottom: 2 },
    signSpace: { height: 48 },
    signTitle: {
      fontFamily: 'Helvetica',
      fontSize: 8.5,
      color: '#475569',
      textAlign: 'center',
      marginTop: 1,
    },
    signLine: {
      width: 170,
      borderTopWidth: 1,
      borderTopColor: '#94a3b8',
      paddingTop: 4,
      fontFamily: 'Helvetica-Bold',
      fontSize: 10,
      color: '#0f172a',
      textAlign: 'center',
    },
    verify: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    verifyBox: { width: 150 },
    qr: { width: 58, height: 58 },
    verifyText: { fontFamily: 'Helvetica', fontSize: 7, color: '#475569' },
    code: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: '#0f172a' },
  })

  const meta: string[] = []
  if (data.hours != null) meta.push(`Duración: ${data.hours} horas`)
  if (data.grade != null) meta.push(`Calificación final: ${data.grade}/20`)
  const issued = formatDateEs(data.issued_at)
  if (issued) meta.push(`Emitido el ${issued}`)

  const issuerRow = h(
    View,
    { style: styles.issuers },
    logo ? h(Image, { src: logo, style: styles.logo }) : null,
    ...issuers.map((i) => h(Text, { key: i.kind, style: styles.issuerName }, i.name)),
  )

  const doc = h(
    Document,
    { title: `${title} - ${data.student_name}`, author: school?.name ?? 'Escuela Digital' },
    h(
      Page,
      { size: 'A4', orientation: 'landscape', style: styles.page },
      h(
        View,
        { style: styles.outer },
        h(
          View,
          { style: styles.inner },
          issuerRow,
          h(Text, { style: styles.title }, title),
          h(View, { style: styles.rule }),
          h(Text, { style: styles.lead }, 'Se otorga a'),
          h(Text, { style: styles.name }, data.student_name),
          h(Text, { style: styles.body }, 'por completar satisfactoriamente el curso'),
          h(Text, { style: styles.course }, data.course_title),
          h(Text, { style: styles.meta }, meta.join('   ·   ')),
          h(
            View,
            { style: styles.footer },
            h(
              View,
              { style: styles.signers },
              ...(signers.length > 0
                ? signers
                : [{ name: data.instructor_name ?? 'Instructor', title: '', signature_path: null }]
              ).map((signer, index) => {
                const image = signer.signature_path
                  ? signatureImages[signer.signature_path]
                  : undefined
                return h(
                  View,
                  { key: index, style: styles.sign },
                  image
                    ? h(Image, { src: image, style: styles.signImage })
                    : h(View, { style: styles.signSpace }),
                  h(Text, { style: styles.signLine }, signer.name),
                  signer.title
                    ? h(Text, { style: styles.signTitle }, signer.title)
                    : null,
                )
              }),
            ),
            h(
              View,
              { style: styles.verify },
              h(
                View,
                { style: styles.verifyBox },
                h(Text, { style: styles.verifyText }, 'Verifica la autenticidad en'),
                h(Text, { style: styles.verifyText }, verifyUrl),
                h(Text, { style: styles.code }, `Código: ${data.code}`),
              ),
              h(Image, { src: qrDataUrl, style: styles.qr }),
            ),
          ),
        ),
      ),
    ),
  )

  return renderToBuffer(doc)
}
