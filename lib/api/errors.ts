// API hata biçimi (SPEC Bölüm 6): `{ error: { code, message_tr } }`. Saf.
// Mesajlar Türkçe ve "sen" dilinde; ayrıntı (yığın, SQL hatası) yanıta yazılmaz.

export const API_ERRORS = {
  unauthenticated: { status: 401, message_tr: "Devam etmek için giriş yapmalısın." },
  forbidden: { status: 403, message_tr: "Bu işlem için yetkin yok." },
  onboarding_incomplete: { status: 403, message_tr: "Önce başlangıç adımlarını tamamlamalısın." },
  invite_required: { status: 403, message_tr: "Önce davet kodunu girmelisin." },
  invalid_input: { status: 400, message_tr: "Gönderilen bilgi eksik ya da hatalı." },
  invalid_code: {
    status: 404,
    message_tr: "Bu davet kodu geçerli değil. Kodu kontrol edip yeniden dene.",
  },
  cohort_full: {
    status: 409,
    message_tr: "Bu grubun kontenjanı doldu. Seni davet eden kişiye haber ver.",
  },
  consent_version_mismatch: {
    status: 409,
    message_tr: "Metin güncellendi. Sayfayı yenileyip yeniden onayla.",
  },
  server_error: { status: 500, message_tr: "Bir şeyler ters gitti. Biraz sonra yeniden dene." },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly message_tr: string;

  constructor(code: ApiErrorCode) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = API_ERRORS[code].status;
    this.message_tr = API_ERRORS[code].message_tr;
  }
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message_tr: string };
}

export function apiErrorBody(code: ApiErrorCode): ApiErrorBody {
  return { error: { code, message_tr: API_ERRORS[code].message_tr } };
}
