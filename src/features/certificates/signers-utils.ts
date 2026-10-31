export type SignatureFileError =
  | 'certificates.signers.errors.fileType'
  | 'certificates.signers.errors.fileSize'

export function validateSignatureFile(
  file: { type: string; size: number },
): SignatureFileError | null {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    return 'certificates.signers.errors.fileType'
  }
  if (file.size > 1_048_576) return 'certificates.signers.errors.fileSize'
  return null
}

export function signatureExtension(type: string): 'png' | 'jpg' | null {
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  return null
}
