/**
 * LibraryView — 书库
 *
 * The five novels shelf. Currently only 《沙丘》is open.
 * Other books are sealed — visible shadows that grow as data/features are built.
 */
import { motion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import type { AppView } from '../../types'

interface Book {
  id: string
  title: string
  author: string
  subtitle: string
  color: string
  glow: string
  available: boolean
  lockedReason?: string
  view?: AppView
}

const BOOKS: Book[] = [
  {
    id: 'dune',
    title: '无名之境',
    author: 'Unnamed Archives',
    subtitle: '来自失落文明的影像碎片。它们不知道自己从哪里来，也不知道你是谁。',
    color: 'rgba(160,130,80,0.9)',
    glow: 'rgba(160,130,80,0.25)',
    available: true,
    view: 'dune',
  },
  {
    id: 'khazar',
    title: '哈扎尔词典',
    author: 'Dictionary of the Khazars',
    subtitle: '任何一个词条都是入口。焦距、时刻、光线——每个维度通向不同的你。',
    color: 'rgba(100,140,180,0.9)',
    glow: 'rgba(100,140,180,0.2)',
    available: true,
    view: 'khazar',
  },
  {
    id: 'cathedral',
    title: '酒吧长谈',
    author: 'Conversation in the Cathedral',
    subtitle: '2019年的一个下午，与2023年的一个下午，在时间里相遇。',
    color: 'rgba(180,100,80,0.6)',
    glow: 'rgba(180,100,80,0.12)',
    available: false,
    lockedReason: '需要时间回响算法',
  },
  {
    id: 'cities',
    title: '看不见的城市',
    author: 'Invisible Cities',
    subtitle: '窗之城。黎明之城。孤独之城。你的镜头一直在描述一些你自己都没有命名的地方。',
    color: 'rgba(140,180,140,0.6)',
    glow: 'rgba(140,180,140,0.12)',
    available: false,
    lockedReason: '需要视觉 AI 标签',
  },
  {
    id: 'shanhaijing',
    title: '山海经',
    author: 'Classic of Mountains and Seas',
    subtitle: '以你走过的地方为经，以光线和时间为纬，构建你自己的神话地理志。',
    color: 'rgba(180,140,80,0.6)',
    glow: 'rgba(180,140,80,0.12)',
    available: false,
    lockedReason: '需要 GPS 数据',
  },
]

function BookSpine({
  book,
  index,
  onOpen,
}: {
  book: Book
  index: number
  onOpen: () => void
}) {
  const isLocked = !book.available

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.25, 0, 0, 1] }}
      style={{ position: 'relative' }}
    >
      <motion.div
        onClick={book.available ? onOpen : undefined}
        whileHover={book.available ? { y: -4, scale: 1.01 } : { opacity: 0.7 }}
        transition={{ duration: 0.2 }}
        style={{
          display: 'flex', gap: 24, alignItems: 'flex-start',
          padding: '20px 24px',
          background: 'rgba(255,255,255,0.02)',
          border: `1px solid ${book.available ? book.color.replace('0.9', '0.2') : 'rgba(255,255,255,0.05)'}`,
          borderRadius: 4,
          cursor: book.available ? 'pointer' : 'default',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow backdrop for available books */}
        {book.available && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(ellipse at 0% 50%, ${book.glow} 0%, transparent 70%)`,
          }} />
        )}

        {/* Color spine strip */}
        <div style={{
          width: 3, flexShrink: 0,
          alignSelf: 'stretch',
          background: isLocked
            ? 'rgba(255,255,255,0.08)'
            : book.color,
          borderRadius: 2,
          boxShadow: isLocked ? 'none' : `0 0 12px ${book.glow}`,
        }} />

        {/* Book info */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <h3 style={{
              margin: 0,
              fontFamily: 'var(--font-serif, Georgia, serif)',
              fontSize: 18, fontWeight: 400,
              letterSpacing: '0.04em',
              color: isLocked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)',
            }}>
              {book.title}
            </h3>
            <span style={{
              fontSize: 10, letterSpacing: '0.1em',
              color: isLocked ? 'rgba(255,255,255,0.1)' : book.color,
              fontFamily: 'monospace',
            }}>
              {book.author}
            </span>
          </div>

          <p style={{
            margin: 0, fontSize: 12, lineHeight: 1.7,
            color: isLocked ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)',
            maxWidth: 480,
          }}>
            {book.subtitle}
          </p>

          {isLocked && book.lockedReason && (
            <div style={{
              marginTop: 10,
              fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ opacity: 0.6 }}>◌</span>
              {book.lockedReason}
            </div>
          )}

          {book.available && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 + index * 0.1 }}
              style={{
                marginTop: 12,
                fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em',
                color: book.color,
              }}
            >
              打开 →
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function LibraryView() {
  const { setView } = useAppStore()

  return (
    <div style={{
      background: 'var(--color-void)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '28px 40px 0',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button
          onClick={() => setView('gateway')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--color-text-muted)',
          }}
        >
          ← 返回
        </button>

        <div style={{ textAlign: 'center' }}>
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif, Georgia, serif)',
              fontSize: 28, fontWeight: 400,
              letterSpacing: '0.15em',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            书库
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            style={{
              margin: '6px 0 0', fontSize: 11,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.08em',
            }}
          >
            同一批照片，五种叙事
          </motion.p>
        </div>

        <div style={{ width: 60 }} />
      </div>

      <div style={{ height: '1px', background: 'var(--color-glass-border)', margin: '20px 40px 0' }} />

      {/* Books list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '28px 40px 40px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {BOOKS.map((book, i) => (
          <BookSpine
            key={book.id}
            book={book}
            index={i}
            onOpen={() => book.view && setView(book.view)}
          />
        ))}
      </div>
    </div>
  )
}
