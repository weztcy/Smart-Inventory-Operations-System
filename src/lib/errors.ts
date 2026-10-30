/** Error aplikasi dengan status HTTP; pesan aman untuk ditampilkan ke user. */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (m: string) => new AppError(400, m);
export const unauthorized = (m = "Sesi tidak valid. Silakan login kembali.") =>
  new AppError(401, m);
export const forbidden = (m = "Anda tidak memiliki izin untuk aksi ini.") =>
  new AppError(403, m);
export const notFound = (m = "Data tidak ditemukan.") => new AppError(404, m);
export const conflict = (m: string) => new AppError(409, m);
