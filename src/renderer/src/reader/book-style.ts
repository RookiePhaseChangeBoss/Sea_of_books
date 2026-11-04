import type { Settings } from '@shared/types'

export function highlightColor(dark: boolean): string {
  return dark ? 'rgba(224, 163, 106, 0.42)' : 'rgba(176, 98, 42, 0.32)'
}

export function readerCss(settings: Settings, dark: boolean): string {
  const paper = dark ? '#171410' : '#f7f3ec'
  const ink = dark ? '#f3ece4' : '#1d1814'
  const link = dark ? '#e7b98a' : '#8a4322'
  const codeBg = dark ? '#241e19' : '#efe6da'
  const align = settings.justify ? 'justify' : 'start'
  const stack = '"Literata", "Palatino Linotype", Palatino, "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", PMingLiU, SimSun, serif'
  return `
    html {
      color-scheme: ${dark ? 'dark' : 'light'};
      background-color: ${paper} !important;
      background-image: none !important;
      color: ${ink} !important;
      font-size: ${settings.fontSize}px !important;
    }
    body {
      background: transparent !important;
      color: inherit !important;
      font-family: ${stack} !important;
      font-size: 1rem !important;
      line-height: ${settings.lineHeight} !important;
      width: auto !important;
      max-width: none !important;
      margin: 0 !important;
      hanging-punctuation: allow-end last;
    }
    body > div, body > section, body > article {
      width: auto !important;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    p, li, blockquote, dd, figcaption {
      line-height: ${settings.lineHeight} !important;
      text-align: ${align};
      line-break: strict;
      orphans: 2;
      widows: 2;
    }
    [align="left"] { text-align: left !important; }
    [align="right"] { text-align: right !important; }
    [align="center"] { text-align: center !important; }
    h1, h2, h3, h4, h5, h6 {
      font-family: ${stack} !important;
      line-height: 1.25 !important;
      font-weight: 600;
      text-align: start;
    }
    a, a * { color: ${link} !important; }
    ::selection { background: ${highlightColor(dark)}; }
    img, svg, video, image { background: transparent !important; }
    pre, code, kbd, samp {
      font-family: "Cascadia Code", "Sarasa Mono SC", Consolas, "Courier New", monospace !important;
    }
    pre {
      white-space: pre-wrap !important;
      background: ${codeBg} !important;
      color: ${ink} !important;
      border-radius: 8px;
      padding: 0.75em 1em;
    }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] { display: none; }
  `
}

export type TocItem = { label: string; href: string; subitems?: TocItem[] }

export type FoliateView = HTMLElement & {
  open: (file: File | Blob) => Promise<void>
  init: (opts: { lastLocation?: unknown; showTextStart?: boolean }) => Promise<void>
  goTo: (target: unknown) => Promise<unknown>
  goToFraction: (fraction: number) => Promise<void>
  goLeft: () => void
  goRight: () => void
  getCFI: (index: number, range: Range) => string
  addAnnotation: (annotation: { value: string; color?: string; note?: string }) => Promise<unknown>
  deleteAnnotation: (annotation: { value: string }) => Promise<unknown>
  close: () => void
  isFixedLayout?: boolean
  renderer: HTMLElement & { setStyles?: (css: string) => void }
  book: {
    metadata?: { title?: unknown; author?: unknown; language?: unknown }
    toc?: TocItem[]
    getCover?: () => Promise<Blob | null | undefined>
    rendition?: { layout?: string }
  }
}

export function pageInlineSize(hostWidth: number, columns: 1 | 2): string {
  const width = Math.max(hostWidth || 0, 360)
  const page = columns === 2 ? width / 2 : width
  return `${Math.max(160, Math.floor(page))}px`
}

export function applyReaderChrome(view: FoliateView, settings: Settings, dark: boolean, hostWidth = 0): void {
  const renderer = view.renderer
  if (!renderer) return
  if (!view.isFixedLayout) {
    const width = hostWidth || view.clientWidth
    renderer.setAttribute('flow', settings.flow)
    renderer.setAttribute('margin', '20px')
    renderer.setAttribute('gap', '2.4%')
    renderer.setAttribute('max-block-size', '10000px')
    renderer.setAttribute('max-column-count', String(settings.columns))
    renderer.setAttribute('max-inline-size', pageInlineSize(width, settings.columns))
  }
  renderer.setStyles?.(readerCss(settings, dark))
}
