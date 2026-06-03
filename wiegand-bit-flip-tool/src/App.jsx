import React, { useMemo, useState } from 'react'

const FORMATS = {
  H10301_26: {
    id: 'H10301_26',
    name: '26-bit HID (H10301) — FC8/CN16',
    totalBits: 26,
    fcBits: 8,
    cnBits: 16,
    parityMode: 'standardSplit',
    leftCount: 12,
    rightCount: 12,
    groupLabel: 'P1 | FC(8) | CN(16) | P2',
  },
  H10306_34: {
    id: 'H10306_34',
    name: '34-bit HID (H10306) — FC16/CN16',
    totalBits: 34,
    fcBits: 16,
    cnBits: 16,
    parityMode: 'standardSplit',
    leftCount: 16,
    rightCount: 16,
    groupLabel: 'P1 | FC(16) | CN(16) | P2',
  },
  H10302_37: {
    id: 'H10302_37',
    name: '37-bit HID (H10302) — CN35 (no FC)',
    totalBits: 37,
    fcBits: 0,
    cnBits: 35,
    parityMode: 'none',
    groupLabel: '[parity vendor-specific] P? | CN(35) | P?',
  },
  H10304_37: {
    id: 'H10304_37',
    name: '37-bit HID (H10304) — FC16/CN19',
    totalBits: 37,
    fcBits: 16,
    cnBits: 19,
    parityMode: 'none',
    groupLabel: '[parity vendor-specific] P? | FC(16) | CN(19) | P?',
  },
  C1000_35: {
    id: 'C1000_35',
    name: '35-bit HID Corporate 1000 — FC12/CN20',
    totalBits: 35,
    fcBits: 12,
    cnBits: 20,
    parityMode: 'none',
    groupLabel: '[multiple parity checks vendor-specific]',
  },
  Casi40_40: {
    id: 'Casi40_40',
    name: '40-bit Casi-Rusco (C10106) — CN38',
    totalBits: 40,
    fcBits: 0,
    cnBits: 38,
    parityMode: 'none',
    groupLabel: '[no parity] [2 sentinel bits]',
  },
}

const clampInt = (n, min, max) => Math.min(Math.max(n, min), max)
const toBits = (n, width) => n.toString(2).padStart(width, '0')
const fromBits = (bits) => parseInt(bits || '0', 2)
const invertBits = (bitstr) => bitstr.split('').map((b) => (b === '0' ? '1' : '0')).join('')
const ones = (s) => s.split('').filter((c) => c === '1').length
const evenParityBit = (bits) => (ones(bits) % 2 === 1 ? '1' : '0')
const oddParityBit = (bits) => (ones(bits) % 2 === 1 ? '0' : '1')
const hexWidthForBits = (widthBits) => Math.ceil(widthBits / 4)
const normalizeDec = (s) => s.trim().replace(/[,_\s]/g, '')
const normalizeHex = (s) => s.trim().replace(/[_\s]/g, '')
const maxForBits = (width) => (BigInt(1) << BigInt(width)) - BigInt(1)

const bitsToHex = (bits) => {
  const val = BigInt('0b' + bits)
  const hex = val.toString(16).toUpperCase().padStart(hexWidthForBits(bits.length), '0')
  return `0x${hex}`
}

const bitsToDec = (bits) => BigInt('0b' + bits).toString(10)

const hexToBitsExact = (hex, width) => {
  let h = normalizeHex(hex).toLowerCase()
  if (h.startsWith('0x')) h = h.slice(2)
  if (!/^[0-9a-f]+$/.test(h)) throw new Error('Invalid hex.')
  const v = BigInt('0x' + h)
  if (v > maxForBits(width)) throw new Error(`Hex exceeds ${width}-bit range.`)
  return v.toString(2).padStart(width, '0')
}

const decToBitsExact = (dec, width) => {
  const d = normalizeDec(dec)
  if (!/^[0-9]+$/.test(d)) throw new Error('Invalid decimal.')
  const v = BigInt(d)
  if (v > maxForBits(width)) throw new Error(`Decimal exceeds ${width}-bit range.`)
  return v.toString(2).padStart(width, '0')
}

const groupBitsForDisplay = (fmt, frameBits) => {
  if (fmt.parityMode === 'standardSplit') {
    const p1 = frameBits[0]
    const data = frameBits.slice(1, frameBits.length - 1)
    const p2 = frameBits[frameBits.length - 1]
    const fc = data.slice(0, fmt.fcBits)
    const cn = data.slice(fmt.fcBits)
    return `${p1} | ${fc} | ${cn} | ${p2}`
  }
  if (fmt.totalBits === fmt.cnBits + 2) {
    const p1 = frameBits[0]
    const data = frameBits.slice(1, frameBits.length - 1)
    const p2 = frameBits[frameBits.length - 1]
    return `${p1} | ${data} | ${p2}`
  }
  if (fmt.id === 'C1000_35') {
    const p1 = frameBits[0]
    const data = frameBits.slice(1, frameBits.length - 1)
    const p2 = frameBits[frameBits.length - 1]
    const fc = data.slice(0, fmt.fcBits)
    const cn = data.slice(fmt.fcBits, fmt.fcBits + fmt.cnBits)
    return `${p1} | ${fc} | ${cn} | ${p2}`
  }
  return frameBits
}

const buildFrameFromFC_CN = (fmt, fcNum, cnNum) => {
  const fcMax = fmt.fcBits > 0 ? (1 << fmt.fcBits) - 1 : 0
  const cnMax = fmt.cnBits >= 31 ? Number.MAX_SAFE_INTEGER : (1 << fmt.cnBits) - 1
  const fc = fmt.fcBits > 0 ? toBits(clampInt(fcNum, 0, fcMax), fmt.fcBits) : ''
  const cn = toBits(clampInt(cnNum, 0, cnMax), fmt.cnBits)
  const data = fc + cn

  if (fmt.parityMode === 'standardSplit') {
    const left = data.slice(0, fmt.leftCount)
    const right = data.slice(data.length - fmt.rightCount)
    const p1 = evenParityBit(left)
    const p2 = oddParityBit(right)
    return p1 + data + p2
  }

  const frame = '0' + data + '0'
  return frame.padStart(fmt.totalBits, '0').slice(-fmt.totalBits)
}

const buildFrameFromPayloadBits = (fmt, dataBits) => {
  if (dataBits.length !== fmt.fcBits + fmt.cnBits) throw new Error(`Payload must be exactly ${fmt.fcBits + fmt.cnBits} bits.`)

  if (fmt.parityMode === 'standardSplit') {
    const left = dataBits.slice(0, fmt.leftCount)
    const right = dataBits.slice(dataBits.length - fmt.rightCount)
    const p1 = evenParityBit(left)
    const p2 = oddParityBit(right)
    return p1 + dataBits + p2
  }

  const frame = '0' + dataBits + '0'
  return frame.padStart(fmt.totalBits, '0').slice(-fmt.totalBits)
}

const parseFrame = (fmt, frameBits) => {
  if (frameBits.length !== fmt.totalBits || /[^01]/.test(frameBits)) throw new Error(`Frame must be ${fmt.totalBits} bits of 0/1.`)
  const data = frameBits.slice(1, frameBits.length - 1)
  const fcBits = fmt.fcBits > 0 ? data.slice(0, fmt.fcBits) : ''
  const cnBits = data.slice(fmt.fcBits, fmt.fcBits + fmt.cnBits)
  const fc = fmt.fcBits > 0 ? fromBits(fcBits) : undefined
  const cn = fromBits(cnBits)

  let p1_ok = null
  let p2_ok = null
  if (fmt.parityMode === 'standardSplit') {
    const left = data.slice(0, fmt.leftCount)
    const right = data.slice(data.length - fmt.rightCount)
    p1_ok = frameBits[0] === evenParityBit(left)
    p2_ok = frameBits[frameBits.length - 1] === oddParityBit(right)
  }

  return { fc, cn, p1_ok, p2_ok }
}

const reapplyParityIfSupported = (fmt, frameBitsOrData, isFullFrame = true) => {
  if (fmt.parityMode !== 'standardSplit') throw new Error('Parity recompute not supported for this format.')
  const data = isFullFrame ? frameBitsOrData.slice(1, frameBitsOrData.length - 1) : frameBitsOrData
  const left = data.slice(0, fmt.leftCount)
  const right = data.slice(data.length - fmt.rightCount)
  return evenParityBit(left) + data + oddParityBit(right)
}

const copy = async (text) => {
  try { await navigator.clipboard.writeText(text) } catch {}
}

function ResultCard({ title, fmt, frame, parsed, showFC, supportsParity, note }) {
  return (
    <div className="card">
      <div className="card-header"><h3>{title}</h3></div>
      <div className="card-content">
        {note ? <p className="muted">{note}</p> : null}
        <div className="row stack gap-8">
          <div className="field-inline">
            <div className="mono code-block">{groupBitsForDisplay(fmt, frame)}</div>
            <button className="btn secondary" onClick={() => copy(frame)}>Copy Bits</button>
          </div>
          <div className="grid-two">
            <div className="field-inline">
              <div className="mono code-block">{bitsToHex(frame)}</div>
              <button className="btn secondary" onClick={() => copy(bitsToHex(frame))}>Copy Hex</button>
            </div>
            <div className="field-inline">
              <div className="mono code-block scroll-x">{bitsToDec(frame)}</div>
              <button className="btn secondary" onClick={() => copy(bitsToDec(frame))}>Copy Dec</button>
            </div>
          </div>
          <div className={`grid ${showFC ? 'grid-two' : 'grid-one'}`}>
            {showFC ? <div className="pill"><span>FC</span> {parsed.fc}</div> : null}
            <div className="pill"><span>CN</span> {parsed.cn}</div>
          </div>
          {supportsParity ? (
            <div className="muted">
              Parity: P1 <strong className={parsed.p1_ok ? 'ok' : 'bad'}>{parsed.p1_ok ? 'OK' : 'BAD'}</strong>
              {' · '}
              P2 <strong className={parsed.p2_ok ? 'ok' : 'bad'}>{parsed.p2_ok ? 'OK' : 'BAD'}</strong>
            </div>
          ) : (
            <div className="muted">Parity: not evaluated for this format.</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [fmtId, setFmtId] = useState('H10301_26')
  const fmt = FORMATS[fmtId]

  const [tab, setTab] = useState('fc_cn')
  const [fc, setFc] = useState('123')
  const [cn, setCn] = useState('10000')
  const [frameBaseHex, setFrameBaseHex] = useState(true)
  const [frameVal, setFrameVal] = useState('0x12AB34C')
  const [payloadBaseHex, setPayloadBaseHex] = useState(true)
  const [payloadVal, setPayloadVal] = useState('0x7B2710')
  const [reparity, setReparity] = useState(true)

  const showFC = fmt.fcBits > 0
  const supportsParity = fmt.parityMode === 'standardSplit'

  const resetExamples = () => {
    setTab('fc_cn')
    setReparity(true)
    setFrameBaseHex(true)
    setPayloadBaseHex(true)
    switch (fmtId) {
      case 'H10301_26':
        setFc('123'); setCn('10000'); setFrameVal('0x12AB34C'); setPayloadVal('0x7B2710'); break
      case 'H10306_34':
        setFc('1000'); setCn('2000'); setFrameVal('0x0F00AA55'); setPayloadVal('0x03E807D0'); break
      case 'H10302_37':
        setFc(''); setCn('200000000'); setFrameVal('0x100000012'); setPayloadVal('0x2FAF080'); break
      case 'H10304_37':
        setFc('65000'); setCn('500000'); setFrameVal('0x120000123'); setPayloadVal('0x0FDE8030'); break
      case 'C1000_35':
        setFc('1200'); setCn('500000'); setFrameVal('0x1ABCDE1'); setPayloadVal('0x1207A120'); break
      case 'Casi40_40':
        setFc(''); setCn('1000000000'); setFrameVal('0x0123456789'); setPayloadVal('0x3B9ACA00'); break
      default:
        break
    }
  }

  const rangeText = useMemo(() => {
    const fcRange = fmt.fcBits > 0 ? `FC 0–${(1 << fmt.fcBits) - 1}` : '(no FC)'
    const cnRange = fmt.cnBits >= 31 ? `CN 0–2^${fmt.cnBits}-1` : `CN 0–${(1 << fmt.cnBits) - 1}`
    return `${fcRange} · ${cnRange}`
  }, [fmt])

  const result = useMemo(() => {
    let originalFrame = ''
    let originDesc = ''

    if (tab === 'fc_cn') {
      const fcNum = showFC ? parseInt(fc || '0', 10) : 0
      const cnNum = parseInt(cn || '0', 10)
      if (Number.isNaN(fcNum) || Number.isNaN(cnNum)) throw new Error('Inputs must be integers.')
      if (showFC && (fcNum < 0 || fcNum >= (1 << fmt.fcBits))) throw new Error(`Facility code must be 0..${(1 << fmt.fcBits) - 1}.`)
      if (cnNum < 0) throw new Error('Card number must be >= 0.')
      originalFrame = buildFrameFromFC_CN(fmt, fcNum, cnNum)
      originDesc = showFC ? `from FC=${fcNum}, CN=${cnNum}` : `from CN=${cnNum}`
    }

    if (tab === 'frame') {
      originalFrame = frameBaseHex ? hexToBitsExact(frameVal, fmt.totalBits) : decToBitsExact(frameVal, fmt.totalBits)
      const p = parseFrame(fmt, originalFrame)
      originDesc = showFC
        ? `from ${frameBaseHex ? 'hex' : 'decimal'} frame (parsed FC=${p.fc}, CN=${p.cn}${supportsParity ? `, P1=${p.p1_ok ? 'OK' : 'BAD'}, P2=${p.p2_ok ? 'OK' : 'BAD'}` : ''})`
        : `from ${frameBaseHex ? 'hex' : 'decimal'} frame (parsed CN=${p.cn}${supportsParity ? `, P1=${p.p1_ok ? 'OK' : 'BAD'}, P2=${p.p2_ok ? 'OK' : 'BAD'}` : ''})`
    }

    if (tab === 'payload') {
      const dataWidth = fmt.fcBits + fmt.cnBits
      const dataBits = payloadBaseHex ? hexToBitsExact(payloadVal, dataWidth) : decToBitsExact(payloadVal, dataWidth)
      originalFrame = buildFrameFromPayloadBits(fmt, dataBits)
      const fcNum = showFC ? parseInt(dataBits.slice(0, fmt.fcBits), 2) : undefined
      const cnNum = parseInt(dataBits.slice(fmt.fcBits), 2)
      originDesc = showFC
        ? `from ${payloadBaseHex ? 'hex' : 'decimal'} payload (FC=${fcNum}, CN=${cnNum})`
        : `from ${payloadBaseHex ? 'hex' : 'decimal'} payload (CN=${cnNum})`
    }

    const origParsed = parseFrame(fmt, originalFrame)
    const flippedFrame = invertBits(originalFrame)
    const flippedParsed = parseFrame(fmt, flippedFrame)

    let validInvertedFrame = null
    let validInvertedParsed = null
    if (reparity && supportsParity) {
      const invertedData = flippedFrame.slice(1, flippedFrame.length - 1)
      validInvertedFrame = reapplyParityIfSupported(fmt, invertedData, false)
      validInvertedParsed = parseFrame(fmt, validInvertedFrame)
    }

    return { originDesc, originalFrame, origParsed, flippedFrame, flippedParsed, validInvertedFrame, validInvertedParsed }
  }, [tab, fc, cn, frameBaseHex, frameVal, payloadBaseHex, payloadVal, reparity, fmt, showFC, supportsParity])

  let error = null
  try {
    // accessing result computes and may throw
    void result.originDesc
  } catch (e) {
    error = e.message || String(e)
  }

  const safeResult = error ? null : result

  return (
    <div className="app-shell">
      <div className="container">
        <header className="hero">
          <div>
            <h1>Wiegand Bit-Flip Tool</h1>
            <p className="muted">26/34/35/37/40-bit formats · Facility/Card, Frame, and Payload inputs · Hex + Decimal</p>
          </div>
          <div className="note">
            <strong>Format layout:</strong> {fmt.groupLabel}<br />
            <span className="muted">Flip simulates D0/D1 reversed by inverting every bit in the frame.</span>
          </div>
        </header>

        <div className="card">
          <div className="card-header"><h2>Format</h2></div>
          <div className="card-content grid-two">
            <div className="field">
              <label htmlFor="fmt">Wiegand format</label>
              <select id="fmt" value={fmtId} onChange={(e) => setFmtId(e.target.value)}>
                {Object.values(FORMATS).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Ranges</label>
              <div className="readonly">{rangeText}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Input</h2></div>
          <div className="card-content">
            <div className="tabs">
              <button className={`tab ${tab === 'fc_cn' ? 'active' : ''}`} onClick={() => setTab('fc_cn')}>{showFC ? 'Facility + Card' : 'Card Number'}</button>
              <button className={`tab ${tab === 'frame' ? 'active' : ''}`} onClick={() => setTab('frame')}>Frame (Hex/Dec)</button>
              <button className={`tab ${tab === 'payload' ? 'active' : ''}`} onClick={() => setTab('payload')}>Payload (Hex/Dec)</button>
            </div>

            {tab === 'fc_cn' && (
              <div className={`grid ${showFC ? 'grid-two' : 'grid-one'}`}>
                {showFC && (
                  <div className="field">
                    <label htmlFor="fc">Facility Code</label>
                    <input id="fc" value={fc} onChange={(e) => setFc(e.target.value)} placeholder="e.g. 123" />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="cn">Card Number</label>
                  <input id="cn" value={cn} onChange={(e) => setCn(e.target.value)} placeholder="e.g. 10000" />
                  <small className="muted">For very large CN values, use Frame/Payload decimal instead.</small>
                </div>
              </div>
            )}

            {tab === 'frame' && (
              <div className="stack gap-12">
                <div className="row between">
                  <div className="toggle-row">
                    <span className={frameBaseHex ? 'active-label' : ''}>Hex</span>
                    <label className="switch">
                      <input type="checkbox" checked={!frameBaseHex} onChange={() => setFrameBaseHex((v) => !v)} />
                      <span className="slider"></span>
                    </label>
                    <span className={!frameBaseHex ? 'active-label' : ''}>Decimal</span>
                  </div>
                  <small className="muted">{fmt.totalBits} bits</small>
                </div>
                <div className="field">
                  <label htmlFor="frameval">{frameBaseHex ? 'Full Frame (hex)' : 'Full Frame (decimal)'}</label>
                  <input id="frameval" value={frameVal} onChange={(e) => setFrameVal(e.target.value)} placeholder={frameBaseHex ? 'e.g. 0x12AB34C' : 'e.g. 19514692'} />
                </div>
              </div>
            )}

            {tab === 'payload' && (
              <div className="stack gap-12">
                <div className="row between">
                  <div className="toggle-row">
                    <span className={payloadBaseHex ? 'active-label' : ''}>Hex</span>
                    <label className="switch">
                      <input type="checkbox" checked={!payloadBaseHex} onChange={() => setPayloadBaseHex((v) => !v)} />
                      <span className="slider"></span>
                    </label>
                    <span className={!payloadBaseHex ? 'active-label' : ''}>Decimal</span>
                  </div>
                  <small className="muted">{fmt.fcBits + fmt.cnBits} data bits</small>
                </div>
                <div className="field">
                  <label htmlFor="payloadval">{payloadBaseHex ? 'Payload/Data Field (hex)' : 'Payload/Data Field (decimal)'}</label>
                  <input id="payloadval" value={payloadVal} onChange={(e) => setPayloadVal(e.target.value)} placeholder={frameBaseHex ? 'e.g. 0x7B2710' : 'e.g. 8070928'} />
                  <small className="muted">Payload is FC+CN only (no parity).</small>
                </div>
              </div>
            )}

            <div className="row between top-gap">
              <div className="toggle-row">
                <span className={supportsParity && reparity ? 'active-label' : ''}>Recompute parity</span>
                <label className="switch">
                  <input type="checkbox" checked={supportsParity && reparity} disabled={!supportsParity} onChange={() => setReparity((v) => !v)} />
                  <span className="slider"></span>
                </label>
              </div>
              <button className="btn" onClick={resetExamples}>Reset examples</button>
            </div>

            {supportsParity ? null : <p className="muted top-gap">Parity recompute is only enabled for 26-bit H10301 and 34-bit H10306.</p>}
            {error ? <div className="alert">{error}</div> : null}
          </div>
        </div>

        {safeResult ? (
          <>
            <div className="grid-two responsive-stack">
              <ResultCard
                title="Original Frame"
                fmt={fmt}
                frame={safeResult.originalFrame}
                parsed={safeResult.origParsed}
                showFC={showFC}
                supportsParity={supportsParity}
                note={`Interpreted ${safeResult.originDesc}`}
              />
              <ResultCard
                title="Flipped Frame (simulate D0/D1 reversed)"
                fmt={fmt}
                frame={safeResult.flippedFrame}
                parsed={safeResult.flippedParsed}
                showFC={showFC}
                supportsParity={supportsParity}
                note={supportsParity ? 'Direct inversion usually fails parity until parity is recomputed.' : 'Field values shown using the selected format layout.'}
              />
            </div>

            {safeResult.validInvertedFrame ? (
              <ResultCard
                title="Valid Frame with Inverted Payload (parity recomputed)"
                fmt={fmt}
                frame={safeResult.validInvertedFrame}
                parsed={safeResult.validInvertedParsed}
                showFC={showFC}
                supportsParity={supportsParity}
                note="Use this when you want the inverted payload to pass parity on 26/34-bit formats."
              />
            ) : null}
          </>
        ) : null}

        <div className="card">
          <div className="card-header"><h2>How decimal input works</h2></div>
          <div className="card-content">
            <ul className="bullets">
              <li><strong>Frame (decimal)</strong> = the full N-bit frame value as a single integer.</li>
              <li><strong>Payload (decimal)</strong> = only the FC+CN data field as a single integer, without parity bits.</li>
              <li>Results always show <strong>Bits + Hex + Decimal</strong> so you can cross-check logs, exports, and controller screens.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
