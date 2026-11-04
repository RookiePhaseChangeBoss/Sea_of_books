export function makePDF(): Promise<never> {
  return Promise.reject(new Error('书洋不打开 PDF'))
}
