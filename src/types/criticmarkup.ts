// Which CriticMarkup syntax was used
export type CriticType =
  | 'highlight'    // {==text==}{>>comment<<}
  | 'comment'      // {>>comment<<}
  | 'addition'     // {++text++}
  | 'deletion'     // {--text--}
  | 'substitution' // {~~old~>new~~}

// Semantic type parsed from Conventional Comments prefix (step 2.3)
export type CommentType = 'note' | 'fix' | 'rewrite' | 'expand' | 'clarify' | 'question' | 'remove'

export interface Comment {
  id: string
  criticType: CriticType
  type: CommentType        // 'note' until step 2.3 adds prefix parsing
  // Main display text: the comment body for 'comment'/'highlight',
  // the content for 'addition'/'deletion', the replacement for 'substitution'
  text: string
  highlightedText?: string // 'highlight' only: the ==highlighted== span
  from?: string            // 'substitution' only: the ~~original~~ text
  to?: string              // 'substitution' only: the ~>replacement text
  raw: string              // full CriticMarkup markup as it appears in source
  rawStart: number         // char offset (inclusive) in raw source string
  rawEnd: number           // char offset (exclusive) in raw source string
  cleanStart: number       // char offset (inclusive) in cleanMarkdown
  cleanEnd: number         // char offset (exclusive) in cleanMarkdown
  blockIndex?: number      // nearest top-level block index (step 2.4)
}
