import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const contentType = 'image/png'
export const size = {
  width: 1200,
  height: 630,
}

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#090909',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px',
          fontFamily: 'Inter, system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '52%',
            transform: 'translate(-50%, -50%)',
            width: '640px',
            height: '380px',
            borderRadius: '999px',
            background:
              'radial-gradient(ellipse, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 45%, transparent 70%)',
          }}
        />

        <div
          style={{
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '999px',
              background: '#22c55e',
              boxShadow: '0 0 10px rgba(34,197,94,0.6)',
            }}
          />
          <div style={{ fontSize: '34px', fontWeight: 700 }}>Perspectify</div>
        </div>

        <div
          style={{
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '44px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '700px' }}>
            <div style={{ fontSize: '52px', lineHeight: 1.08, fontWeight: 700, color: '#fff' }}>
              Never lose a Stripe
            </div>
            <div style={{ fontSize: '52px', lineHeight: 1.08, fontWeight: 700, color: '#22c55e' }}>
              payment again.
            </div>
            <div
              style={{
                marginTop: '24px',
                fontSize: '20px',
                color: '#a1a1aa',
                lineHeight: 1.45,
              }}
            >
              Perspectify sits between Stripe and Zapier/Make.
            </div>
          </div>

          <div
            style={{
              width: '420px',
              background: '#111111',
              border: '1px solid #1a1a1a',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            <div style={{ color: '#22c55e', fontSize: '20px' }}>
              CAPTURED   $149.00 · Carlos M.
            </div>
            <div style={{ color: '#f59e0b', fontSize: '20px' }}>RETRY 1/7   in 5s...</div>
            <div style={{ color: '#22c55e', fontSize: '20px' }}>
              DELIVERED   200 OK ✓
            </div>
          </div>
        </div>

        <div
          style={{
            zIndex: 1,
            fontSize: '24px',
            color: '#71717a',
          }}
        >
          perspectify.com
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
