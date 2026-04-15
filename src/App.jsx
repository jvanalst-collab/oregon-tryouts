import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase, uploadPhoto } from './supabase'

// ── CONSTANTS ──
const G = '#154733', Y = '#FEE123'
const POSITIONS = ['GK','CB','RB','LB','RB/LB','CDM','CM','CAM','LW','RW','Wing','ST','CF']
const YEAR_COLORS = { FR:'#60a5fa', SOPH:'#34d399', JUN:'#fbbf24', SEN:'#f87171', GRAD:'#c084fc' }
const POS_GROUPS = {
  All: () => true,
  DEF: p => ['CB','RB','LB','RB/LB','OB','DEF'].some(x => (p.pos1||'').toUpperCase().includes(x)||(p.pos2||'').toUpperCase().includes(x)),
  MID: p => ['CM','CDM','CAM','8','10'].some(x => (p.pos1||'').toUpperCase().includes(x)||(p.pos2||'').toUpperCase().includes(x)),
  ATK: p => ['ST','Wing','LW','RW','CF','Winger'].some(x => (p.pos1||'').includes(x)||(p.pos2||'').includes(x)),
  GK: p => (p.pos1||'')==='GK',
}

// ── EVALUATION TAGS ──
const POS_TAGS = [
  { label: 'Great first touch', val: '+first_touch', pos: true },
  { label: 'Poor first touch', val: '-first_touch', pos: false },
  { label: 'Quick speed of play', val: '+speed_of_play', pos: true },
  { label: 'Slow speed of play', val: '-speed_of_play', pos: false },
  { label: 'Smart decisions', val: '+decisions', pos: true },
  { label: 'Poor decisions', val: '-decisions', pos: false },
  { label: 'Accurate passer', val: '+passing', pos: true },
  { label: 'Poor passing', val: '-passing', pos: false },
  { label: 'Strong off-ball movement', val: '+off_ball', pos: true },
  { label: 'Ball watches / static', val: '-off_ball', pos: false },
  { label: 'Wins 1v1s', val: '+1v1', pos: true },
  { label: 'Avoids / loses 1v1s', val: '-1v1', pos: false },
  { label: 'High work rate', val: '+work_rate', pos: true },
  { label: 'Low work rate', val: '-work_rate', pos: false },
  { label: 'Vocal / communicates', val: '+communication', pos: true },
  { label: 'Doesn\'t communicate', val: '-communication', pos: false },
  { label: 'Composed under pressure', val: '+composure', pos: true },
  { label: 'Loses composure', val: '-composure', pos: false },
  { label: 'Great positioning', val: '+positioning', pos: true },
  { label: 'Poor positioning', val: '-positioning', pos: false },
  { label: 'Makes others better', val: '+elevates', pos: true },
  { label: 'Doesn\'t impact the game', val: '-impact', pos: false },
  { label: 'Athletic / fast', val: '+athletic', pos: true },
  { label: 'Lacks athleticism', val: '-athletic', pos: false },
  { label: 'Tracks back / defends', val: '+tracks_back', pos: true },
  { label: 'Doesn\'t track back', val: '-tracks_back', pos: false },
  { label: 'Good soccer brain', val: '+soccer_iq', pos: true },
  { label: 'Slow to read the game', val: '-soccer_iq', pos: false },
  { label: 'Wins aerial duels', val: '+aerial', pos: true },
  { label: 'Creative in attack', val: '+creative', pos: true },
  { label: 'Strong defender', val: '+defending', pos: true },
  { label: 'Coachable / listens', val: '+coachable', pos: true },
  { label: 'Leader on the field', val: '+leader', pos: true },
]

// ── STYLES ──
const input = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #334155', background:'#0f172a', color:'#e2e8f0', fontSize:16, boxSizing:'border-box' }
const select = { ...input, appearance:'none', backgroundImage:"url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e\")", backgroundRepeat:'no-repeat', backgroundPosition:'right 12px center', backgroundSize:16 }
const labelSt = { color:'#94a3b8', fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:1, marginBottom:5, display:'block' }

// ═══════════════════════════════════════════
// PLAYER CHECK-IN FORM
// ═══════════════════════════════════════════
function PlayerCheckIn({ onBack }) {
  const [form, setForm] = useState({ first:'', last:'', pos1:'', pos2:'', year:'', num:'', phone:'' })
  const [photo, setPhoto] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handlePhoto = (e) => {
    const file = e.target.files[0]; if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPhoto(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    const { first, last, pos1, year, num, phone } = form
    if (!first.trim()||!last.trim()) return setError('Enter your first and last name.')
    if (!pos1) return setError('Select your primary position.')
    if (!year) return setError('Select your year.')
    if (!num||isNaN(num)) return setError('Enter your pinnie number.')
    if (!phone.trim()) return setError('Enter your phone number.')
    if (!photo) return setError('Take a photo before submitting.')
    setError(''); setLoading(true)
    try {
      const { data: existing } = await supabase.from('players').select('id').eq('pinnie_num', parseInt(num))
      if (existing && existing.length > 0) { setError('Pinnie #'+num+' is already taken.'); setLoading(false); return }
      const { data: player, error: insertErr } = await supabase.from('players').insert({
        first_name: first.trim(), last_name: last.trim(), pos1: form.pos1, pos2: form.pos2||'',
        year, pinnie_num: parseInt(num), phone: phone.trim(),
      }).select().single()
      if (insertErr) throw insertErr
      const photoUrl = await uploadPhoto(player.id, photoFile)
      await supabase.from('players').update({ photo_url: photoUrl }).eq('id', player.id)
      const { data: settings } = await supabase.from('app_settings').select('value').eq('key','current_day').single()
      const currentDay = parseInt(settings?.value || '1')
      await supabase.from('day_checkins').upsert({ player_id: player.id, day_number: currentDay, checked_in: true })
      setSubmitted(true)
    } catch (err) { setError('Something went wrong: ' + err.message) }
    setLoading(false)
  }

  if (submitted) return (
    <div style={{ minHeight:'100vh', background:'#020617', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32 }}>
      <div style={{ width:80, height:80, borderRadius:'50%', background:G, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}><span style={{ fontSize:40, color:Y }}>✓</span></div>
      <div style={{ fontSize:28, fontWeight:700, color:Y, fontFamily:"'Oswald',sans-serif", marginBottom:8 }}>YOU'RE CHECKED IN</div>
      <div style={{ color:'#94a3b8', fontSize:15, textAlign:'center', maxWidth:300, lineHeight:1.5 }}>{form.first} #{form.num} — you're all set. Good luck.</div>
      {photo && <img src={photo} alt="" style={{ width:120, height:120, borderRadius:16, objectFit:'cover', marginTop:24, border:'3px solid '+G }} />}
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#020617' }}>
      <div style={{ background:G, padding:'24px 20px', textAlign:'center' }}>
        <div style={{ fontSize:13, color:'#ffffffaa', textTransform:'uppercase', letterSpacing:2, marginBottom:4 }}>Oregon Club Soccer</div>
        <div style={{ fontSize:28, fontWeight:700, color:Y, fontFamily:"'Oswald',sans-serif" }}>TRYOUT CHECK-IN</div>
        <div style={{ fontSize:13, color:'#ffffffcc', marginTop:6 }}>Fill out the form and snap a photo.</div>
      </div>
      <div style={{ padding:20, maxWidth:480, margin:'0 auto' }}>
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          <div style={{ flex:1 }}><label style={labelSt}>First Name</label><input value={form.first} onChange={e=>set('first',e.target.value)} placeholder="First" style={input} /></div>
          <div style={{ flex:1 }}><label style={labelSt}>Last Name</label><input value={form.last} onChange={e=>set('last',e.target.value)} placeholder="Last" style={input} /></div>
        </div>
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          <div style={{ flex:1 }}><label style={labelSt}>Primary Position</label><select value={form.pos1} onChange={e=>set('pos1',e.target.value)} style={select}><option value="">Select...</option>{POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
          <div style={{ flex:1 }}><label style={labelSt}>Secondary (optional)</label><select value={form.pos2} onChange={e=>set('pos2',e.target.value)} style={select}><option value="">None</option>{POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
        </div>
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          <div style={{ flex:1 }}><label style={labelSt}>Year</label><select value={form.year} onChange={e=>set('year',e.target.value)} style={select}><option value="">Select...</option><option value="FR">Freshman</option><option value="SOPH">Sophomore</option><option value="JUN">Junior</option><option value="SEN">Senior</option><option value="GRAD">Grad Student</option></select></div>
          <div style={{ flex:1 }}><label style={labelSt}>Pinnie Number</label><input value={form.num} onChange={e=>set('num',e.target.value)} placeholder="#" type="number" style={input} /></div>
        </div>
        <div style={{ marginBottom:16 }}><label style={labelSt}>Phone Number</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="(555) 123-4567" type="tel" style={input} /></div>
        <div style={{ marginBottom:20 }}>
          <label style={labelSt}>Your Photo</label>
          <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handlePhoto} style={{ display:'none' }} />
          {photo ? (
            <div style={{ position:'relative', display:'inline-block' }}>
              <img src={photo} alt="" style={{ width:140, height:140, borderRadius:16, objectFit:'cover', border:'3px solid '+G }} />
              <button onClick={()=>{setPhoto(null);setPhotoFile(null);fileRef.current.value=''}} style={{ position:'absolute', top:-8, right:-8, width:28, height:28, borderRadius:'50%', background:'#dc2626', border:'none', color:'#fff', fontSize:16, cursor:'pointer', fontWeight:700 }}>×</button>
            </div>
          ) : (
            <button onClick={()=>fileRef.current.click()} style={{ width:'100%', padding:'28px 14px', borderRadius:12, border:'2px dashed #334155', background:'#0f172a', color:'#64748b', fontSize:15, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:36 }}>📸</span><span style={{ fontWeight:600 }}>Tap to take your photo</span><span style={{ fontSize:12, color:'#475569' }}>Opens your front camera on mobile</span>
            </button>
          )}
        </div>
        {error && <div style={{ background:'#7f1d1d40', color:'#fca5a5', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading} style={{ width:'100%', padding:14, borderRadius:12, border:'none', background:G, color:Y, fontSize:17, fontWeight:700, fontFamily:"'Oswald',sans-serif", letterSpacing:1, cursor:loading?'wait':'pointer', opacity:loading?0.6:1 }}>{loading ? 'CHECKING IN...' : 'CHECK IN'}</button>
        {onBack && <button onClick={onBack} style={{ width:'100%', marginTop:10, padding:10, border:'none', background:'transparent', color:'#475569', fontSize:13, cursor:'pointer' }}>← Back</button>}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════
// EVALUATOR LOGIN
// ═══════════════════════════════════════════
function EvalLogin({ onLogin, onBack }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!code.trim()) return setError('Enter your access code.')
    setLoading(true); setError('')
    const { data, error: err } = await supabase.from('evaluators').select('*').eq('access_code', code.trim().toUpperCase()).single()
    if (err || !data) { setError('Invalid access code.'); setLoading(false); return }
    onLogin(data)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#020617', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32 }}>
      <div style={{ fontSize:24, fontWeight:700, color:Y, fontFamily:"'Oswald',sans-serif", marginBottom:4 }}>EVALUATOR LOGIN</div>
      <div style={{ color:'#64748b', fontSize:13, marginBottom:24, textAlign:'center' }}>Enter the access code you were given.</div>
      <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ACCESS CODE" onKeyDown={e=>e.key==='Enter'&&handleLogin()}
        style={{ ...input, maxWidth:300, textAlign:'center', fontSize:20, fontWeight:700, fontFamily:"'Oswald',sans-serif", letterSpacing:2 }} />
      {error && <div style={{ color:'#fca5a5', fontSize:13, marginTop:10 }}>{error}</div>}
      <button onClick={handleLogin} disabled={loading} style={{ marginTop:16, padding:'12px 40px', borderRadius:10, border:'none', background:G, color:Y, fontSize:16, fontWeight:700, fontFamily:"'Oswald',sans-serif", cursor:'pointer' }}>{loading?'CHECKING...':'ENTER'}</button>
      {onBack && <button onClick={onBack} style={{ marginTop:12, border:'none', background:'transparent', color:'#475569', fontSize:13, cursor:'pointer' }}>← Back</button>}
    </div>
  )
}


// ═══════════════════════════════════════════
// SCORING CARD WITH TAGS + DEBOUNCED NOTES
// ═══════════════════════════════════════════
function ScoringCard({ player, scoreData, onScoreField, onToggleTag, expanded, onToggle }) {
  const sc = scoreData || {}
  const isScored = sc.game_ability != null && sc.intangibles != null
  const [localNotes, setLocalNotes] = useState(sc.notes || '')
  const debounceRef = useRef(null)

  // Sync from server only when card is first opened or player changes
  const playerIdRef = useRef(player.id)
  useEffect(() => {
    if (playerIdRef.current !== player.id) {
      playerIdRef.current = player.id
      setLocalNotes(sc.notes || '')
    }
  }, [player.id, sc.notes])

  // Only sync from server if notes changed externally (not while typing)
  const isFocused = useRef(false)
  useEffect(() => {
    if (!isFocused.current) setLocalNotes(sc.notes || '')
  }, [sc.notes])

  const handleNotesChange = (val) => {
    setLocalNotes(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onScoreField('notes', val), 1000)
  }

  const tags = sc.tags ? (typeof sc.tags === 'string' ? JSON.parse(sc.tags) : sc.tags) : []

  const PlayerPhoto = ({ size=44 }) => player.photo_url
    ? <img src={player.photo_url} alt="" style={{ width:size, height:size, borderRadius:size/4, objectFit:'cover', border:'2px solid '+G, flexShrink:0 }} />
    : <div style={{ width:size, height:size, borderRadius:size/4, background:G, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Oswald',sans-serif", fontSize:size*0.45, fontWeight:700, color:Y, flexShrink:0 }}>{player.pinnie_num}</div>

  return (
    <div style={{ background:'#0f172a', borderRadius:12, overflow:'hidden', border:'1px solid '+(isScored?G+'60':'#1e293b'), marginBottom:8 }}>
      <button onClick={onToggle} style={{ width:'100%', padding:'10px 14px', border:'none', background:'transparent', display:'flex', alignItems:'center', gap:10, cursor:'pointer', textAlign:'left' }}>
        <PlayerPhoto />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:13, fontWeight:700, color:Y, background:G, padding:'0 5px', borderRadius:3 }}>#{player.pinnie_num}</span>
            <span style={{ color:'#f1f5f9', fontSize:14, fontWeight:600 }}>{player.first_name} {player.last_name}</span>
          </div>
          <div style={{ display:'flex', gap:5, marginTop:3, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'#94a3b8', background:'#1e293b', padding:'1px 6px', borderRadius:4 }}>{player.pos1}{player.pos2?' / '+player.pos2:''}</span>
            <span style={{ fontSize:10, color:'#0f172a', background:YEAR_COLORS[player.year]||'#64748b', padding:'1px 6px', borderRadius:4, fontWeight:600 }}>{player.year}</span>
          </div>
        </div>
        {isScored && <div style={{ background:G+'30', color:Y, fontSize:13, padding:'4px 8px', borderRadius:6, fontWeight:600, flexShrink:0 }}>{sc.game_ability}/{sc.intangibles}</div>}
        {tags.length > 0 && <div style={{ background:'#1e293b', color:'#94a3b8', fontSize:11, padding:'3px 7px', borderRadius:5, flexShrink:0 }}>{tags.length} tag{tags.length>1?'s':''}</div>}
        <span style={{ color:'#475569', fontSize:18, transform:expanded?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s', flexShrink:0 }}>▾</span>
      </button>
      {expanded && (
        <div style={{ padding:'4px 14px 14px', borderTop:'1px solid #1e293b' }}>
          {/* Score buttons */}
          {['Game Ability','Intangibles'].map((cat,ci) => {
            const field = ci===0?'game_ability':'intangibles'
            return (
              <div key={cat} style={{ marginBottom:12 }}>
                <div style={{ color:'#94a3b8', fontSize:11, fontWeight:600, marginBottom:5, textTransform:'uppercase', letterSpacing:1 }}>{cat}</div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(v => (
                    <button key={v} onClick={()=>onScoreField(field,v)} style={{
                      width:40, height:40, borderRadius:8, border:'none', background:sc[field]===v?G:'#1e293b',
                      color:sc[field]===v?Y:'#94a3b8', fontSize:16, fontWeight:700, cursor:'pointer',
                      boxShadow:sc[field]===v?'0 0 0 2px '+Y:'none',
                    }}>{v}</button>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Quick tags */}
          <div style={{ marginBottom:12 }}>
            <div style={{ color:'#94a3b8', fontSize:11, fontWeight:600, marginBottom:5, textTransform:'uppercase', letterSpacing:1 }}>Quick Tags (tap to toggle)</div>
            <div style={{ color:'#475569', fontSize:10, marginBottom:6 }}>Strengths</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
              {POS_TAGS.filter(t=>t.pos).map(t => {
                const active = tags.includes(t.val)
                return <button key={t.val} onClick={()=>onToggleTag(t.val)} style={{
                  padding:'5px 10px', borderRadius:16, border:'none', fontSize:11, fontWeight:600, cursor:'pointer',
                  background: active ? G : '#1e293b', color: active ? Y : '#94a3b8',
                  boxShadow: active ? '0 0 0 1px '+G : 'none',
                }}>{active?'✓ ':''}{t.label}</button>
              })}
            </div>
            <div style={{ color:'#475569', fontSize:10, marginBottom:6 }}>Weaknesses</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {POS_TAGS.filter(t=>!t.pos).map(t => {
                const active = tags.includes(t.val)
                return <button key={t.val} onClick={()=>onToggleTag(t.val)} style={{
                  padding:'5px 10px', borderRadius:16, border:'none', fontSize:11, fontWeight:600, cursor:'pointer',
                  background: active ? '#7f1d1d' : '#1e293b', color: active ? '#fca5a5' : '#94a3b8',
                  boxShadow: active ? '0 0 0 1px #7f1d1d' : 'none',
                }}>{active?'✓ ':''}{t.label}</button>
              })}
            </div>
          </div>

          {/* Notes - debounced */}
          <div>
            <div style={{ color:'#94a3b8', fontSize:11, fontWeight:600, marginBottom:5, textTransform:'uppercase', letterSpacing:1 }}>Notes (optional)</div>
            <textarea value={localNotes}
              onFocus={()=>{isFocused.current=true}}
              onBlur={()=>{isFocused.current=false; onScoreField('notes', localNotes)}}
              onChange={e=>handleNotesChange(e.target.value)}
              placeholder="Anything else..."
              style={{ width:'100%', minHeight:50, background:'#1e293b', border:'1px solid #334155', borderRadius:8, color:'#e2e8f0', padding:10, fontSize:14, resize:'vertical', boxSizing:'border-box' }} />
          </div>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════
// MAIN EVALUATOR / COACH VIEW
// ═══════════════════════════════════════════
function EvalView({ evaluator, onLogout }) {
  const [view, setView] = useState('roster')
  const [players, setPlayers] = useState([])
  const [scores, setScores] = useState([])
  const [checkins, setCheckins] = useState([])
  const [evaluators, setEvaluators] = useState([])
  const [currentDay, setCurrentDay] = useState(1)
  const [posFilter, setPosFilter] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [showUnscoredOnly, setShowUnscoredOnly] = useState(false)
  const [sortBy, setSortBy] = useState('num')
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [expandedDash, setExpandedDash] = useState(null)
  const [showCutPlayers, setShowCutPlayers] = useState(false)
  const isCoach = evaluator.role === 'coach'

  // ── DATA LOADING ──
  const loadAll = useCallback(async () => {
    const [{ data: p }, { data: s }, { data: c }, { data: e }, { data: settings }] = await Promise.all([
      supabase.from('players').select('*').order('pinnie_num'),
      supabase.from('scores').select('*'),
      supabase.from('day_checkins').select('*'),
      supabase.from('evaluators').select('*'),
      supabase.from('app_settings').select('*').eq('key','current_day').single(),
    ])
    setPlayers(p||[]); setScores(s||[]); setCheckins(c||[]); setEvaluators(e||[])
    if (settings?.value) setCurrentDay(parseInt(settings.value))
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    const channel = supabase.channel('tryout-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_checkins' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadAll])

  // ── HELPERS ──
  const isCheckedIn = useCallback((playerId, day) => checkins.find(c => c.player_id === playerId && c.day_number === day)?.checked_in || false, [checkins])
  const getScore = useCallback((evalId, playerId, day) => scores.find(s => s.evaluator_id === evalId && s.player_id === playerId && s.day_number === day), [scores])
  const activePlayers = useMemo(() => players.filter(p => p.status === 'active'), [players])

  const toggleCheckin = async (playerId, day) => {
    const existing = checkins.find(c => c.player_id === playerId && c.day_number === day)
    if (existing) { await supabase.from('day_checkins').update({ checked_in: !existing.checked_in }).eq('id', existing.id) }
    else { await supabase.from('day_checkins').insert({ player_id: playerId, day_number: day, checked_in: true }) }
    loadAll()
  }

  const submitScoreField = async (playerId, field, value) => {
    const existing = getScore(evaluator.id, playerId, currentDay)
    if (existing) { await supabase.from('scores').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', existing.id) }
    else { await supabase.from('scores').insert({ evaluator_id: evaluator.id, player_id: playerId, day_number: currentDay, [field]: value }) }
    loadAll()
  }

  const toggleTag = async (playerId, tagVal) => {
    const existing = getScore(evaluator.id, playerId, currentDay)
    let tags = []
    if (existing?.tags) { tags = typeof existing.tags === 'string' ? JSON.parse(existing.tags) : existing.tags }
    if (tags.includes(tagVal)) { tags = tags.filter(t => t !== tagVal) } else { tags.push(tagVal) }
    const tagsStr = JSON.stringify(tags)
    if (existing) { await supabase.from('scores').update({ tags: tagsStr, updated_at: new Date().toISOString() }).eq('id', existing.id) }
    else { await supabase.from('scores').insert({ evaluator_id: evaluator.id, player_id: playerId, day_number: currentDay, tags: tagsStr }) }
    loadAll()
  }

  const cutPlayer = async (playerId) => {
    await supabase.from('players').update({ status: 'cut', cut_after_day: currentDay }).eq('id', playerId)
    loadAll()
  }
  const uncutPlayer = async (playerId) => {
    await supabase.from('players').update({ status: 'active', cut_after_day: null }).eq('id', playerId)
    loadAll()
  }

  // Day navigation — forward and back
  const goToDay = async (day) => {
    if (day < 1 || day > 4) return
    await supabase.from('app_settings').update({ value: String(day) }).eq('key', 'current_day')
    setCurrentDay(day)
  }

  // ── SCORING DATA ──
  const dayCheckedInPlayers = useMemo(() => activePlayers.filter(p => isCheckedIn(p.id, currentDay)), [activePlayers, currentDay, isCheckedIn])

  const scoringPlayers = useMemo(() => {
    let p = view === 'score' ? [...dayCheckedInPlayers] : [...activePlayers]
    if (posFilter !== 'All') p = p.filter(POS_GROUPS[posFilter])
    if (searchTerm) { const s = searchTerm.toLowerCase(); p = p.filter(pl => pl.first_name.toLowerCase().includes(s) || pl.last_name.toLowerCase().includes(s) || String(pl.pinnie_num).includes(s)) }
    if (showUnscoredOnly) { p = p.filter(pl => { const s = getScore(evaluator.id, pl.id, currentDay); return !s || s.game_ability == null }) }
    return p
  }, [dayCheckedInPlayers, activePlayers, posFilter, searchTerm, showUnscoredOnly, evaluator.id, currentDay, scores, view])

  const evalProgress = useMemo(() => {
    return evaluators.map(ev => {
      const scored = dayCheckedInPlayers.filter(p => { const s = getScore(ev.id, p.id, currentDay); return s && s.game_ability != null && s.intangibles != null }).length
      return { ...ev, scored, total: dayCheckedInPlayers.length }
    })
  }, [dayCheckedInPlayers, evaluators, currentDay, scores])

  // ── DASHBOARD DATA ──
  const dashboardData = useMemo(() => {
    const showPlayers = showCutPlayers ? players : activePlayers
    return showPlayers.map(player => {
      const playerScores = scores.filter(s => s.player_id === player.id)
      const byDay = {}
      for (let d = 1; d <= 4; d++) {
        const dayScores = playerScores.filter(s => s.day_number === d)
        const games = dayScores.map(s => s.game_ability).filter(v => v != null)
        const ints = dayScores.map(s => s.intangibles).filter(v => v != null)
        if (games.length) byDay[d] = { avgGame: games.reduce((a,b)=>a+b,0)/games.length, avgInt: ints.reduce((a,b)=>a+b,0)/ints.length, count: games.length }
      }
      const allGames = playerScores.map(s => s.game_ability).filter(v => v != null)
      const allInts = playerScores.map(s => s.intangibles).filter(v => v != null)
      const avgGame = allGames.length ? allGames.reduce((a,b)=>a+b,0)/allGames.length : null
      const avgInt = allInts.length ? allInts.reduce((a,b)=>a+b,0)/allInts.length : null
      const avgTotal = avgGame != null && avgInt != null ? (avgGame+avgInt)/2 : null
      // Collect all tags
      const allTags = playerScores.flatMap(s => { try { return s.tags ? (typeof s.tags==='string' ? JSON.parse(s.tags) : s.tags) : [] } catch { return [] } })
      const tagCounts = {}; allTags.forEach(t => { tagCounts[t] = (tagCounts[t]||0)+1 })
      const allNotes = evaluators.map(ev => { const s = playerScores.find(sc => sc.evaluator_id===ev.id && sc.notes); return s ? { name:ev.name, day:s.day_number, note:s.notes } : null }).filter(Boolean)
      const daysCheckedIn = [1,2,3,4].filter(d => checkins.find(c => c.player_id===player.id && c.day_number===d)?.checked_in)
      // Collect cut/keep recommendations from all evaluators for current day
      const recommendations = evaluators.map(ev => {
        const s = scores.find(sc => sc.evaluator_id===ev.id && sc.player_id===player.id && sc.day_number===currentDay)
        return { name: ev.name, rec: s?.recommendation || null }
      }).filter(r => r.rec)
      return { ...player, avgGame, avgInt, avgTotal, evalCount: new Set(playerScores.filter(s=>s.game_ability!=null).map(s=>s.evaluator_id)).size, allNotes, byDay, daysCheckedIn, tagCounts, recommendations }
    })
  }, [players, activePlayers, scores, evaluators, checkins, showCutPlayers, currentDay])

  const filteredDashboard = useMemo(() => {
    let d = dashboardData
    if (posFilter !== 'All') d = d.filter(POS_GROUPS[posFilter])
    return d.sort((a,b) => {
      if (sortBy==='num') return a.pinnie_num-b.pinnie_num
      if (sortBy==='avg') return (b.avgTotal??-1)-(a.avgTotal??-1)
      if (sortBy==='game') return (b.avgGame??-1)-(a.avgGame??-1)
      if (sortBy==='intangibles') return (b.avgInt??-1)-(a.avgInt??-1)
      if (sortBy==='name') return a.last_name.localeCompare(b.last_name)
      return 0
    })
  }, [dashboardData, posFilter, sortBy])

  // ── RECOMMENDATION (cut/keep) ──
  const submitRec = async (playerId, rec) => {
    const existing = getScore(evaluator.id, playerId, currentDay)
    const newRec = existing?.recommendation === rec ? null : rec
    if (existing) { await supabase.from('scores').update({ recommendation: newRec, updated_at: new Date().toISOString() }).eq('id', existing.id) }
    else { await supabase.from('scores').insert({ evaluator_id: evaluator.id, player_id: playerId, day_number: currentDay, recommendation: newRec }) }
    loadAll()
  }

  const getMyRec = (playerId) => {
    const s = getScore(evaluator.id, playerId, currentDay)
    return s?.recommendation || null
  }

  // ── RENDER HELPERS ──
  const tabStyle = t => ({ flex:1, padding:'10px 0', border:'none', borderBottom:'3px solid '+(view===t?Y:'transparent'), background:'transparent', color:view===t?Y:'#64748b', fontWeight:700, fontSize:11, cursor:'pointer', textTransform:'uppercase', letterSpacing:1 })
  const pillBtn = (active, onClick, text) => <button onClick={onClick} style={{ padding:'4px 10px', borderRadius:20, border:'none', background:active?G:'#1e293b', color:active?Y:'#64748b', fontSize:11, fontWeight:600, cursor:'pointer' }}>{text}</button>
  const emptyState = (icon, msg) => <div style={{ textAlign:'center', padding:'60px 20px', color:'#475569' }}><div style={{ fontSize:48, marginBottom:12 }}>{icon}</div><div style={{ fontSize:15, fontWeight:600, color:'#64748b' }}>{msg}</div></div>
  const PlayerPhoto = ({ player: p, size=40 }) => p.photo_url
    ? <img src={p.photo_url} alt="" style={{ width:size, height:size, borderRadius:size/4, objectFit:'cover', border:'2px solid '+G, flexShrink:0 }} />
    : <div style={{ width:size, height:size, borderRadius:size/4, background:G, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Oswald',sans-serif", fontSize:size*0.45, fontWeight:700, color:Y, flexShrink:0 }}>{p.pinnie_num}</div>

  const RecButtons = ({ playerId, size=24 }) => {
    const rec = getMyRec(playerId)
    return (
      <div style={{ display:'flex', gap:3, flexShrink:0 }}>
        <button onClick={e=>{e.stopPropagation();submitRec(playerId,'keep')}} style={{ width:size, height:size, borderRadius:5, border:'none', cursor:'pointer', background:rec==='keep'?G:'#1e293b', color:rec==='keep'?Y:'#475569', fontSize:size*0.55, fontWeight:700 }}>✓</button>
        <button onClick={e=>{e.stopPropagation();submitRec(playerId,'cut')}} style={{ width:size, height:size, borderRadius:5, border:'none', cursor:'pointer', background:rec==='cut'?'#7f1d1d':'#1e293b', color:rec==='cut'?'#fca5a5':'#475569', fontSize:size*0.55, fontWeight:700 }}>✗</button>
      </div>
    )
  }

  // Day nav component
  const DayNav = () => (
    <div style={{ display:'flex', alignItems:'center', gap:2 }}>
      <button onClick={()=>goToDay(currentDay-1)} disabled={currentDay<=1} style={{ width:24, height:24, borderRadius:4, border:'none', background:'#ffffff15', color:currentDay<=1?'#ffffff22':'#ffffffcc', fontSize:14, cursor:currentDay<=1?'default':'pointer', fontWeight:700 }}>◂</button>
      {[1,2,3,4].map(d => (
        <button key={d} onClick={()=>goToDay(d)} style={{
          padding:'4px 10px', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer', border:'none',
          background: d===currentDay?Y : d<currentDay?G+'aa':'#ffffff15',
          color: d===currentDay?G : d<currentDay?'#ffffffcc':'#ffffff44',
          fontFamily:"'Oswald',sans-serif",
        }}>D{d}</button>
      ))}
      <button onClick={()=>goToDay(currentDay+1)} disabled={currentDay>=4} style={{ width:24, height:24, borderRadius:4, border:'none', background:'#ffffff15', color:currentDay>=4?'#ffffff22':'#ffffffcc', fontSize:14, cursor:currentDay>=4?'default':'pointer', fontWeight:700 }}>▸</button>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#020617' }}>
      {/* HEADER */}
      <div style={{ background:G, padding:'10px 16px 0' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <button onClick={onLogout} style={{ background:'none', border:'none', color:'#ffffffaa', fontSize:18, cursor:'pointer', padding:0 }}>←</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:700, color:Y, fontFamily:"'Oswald',sans-serif" }}>TRYOUT HQ</div>
            <div style={{ fontSize:11, color:'#ffffffaa' }}>{evaluator.name}</div>
          </div>
          <DayNav />
        </div>
        <div style={{ display:'flex' }}>
          <button onClick={()=>setView('roster')} style={tabStyle('roster')}>Roster</button>
          <button onClick={()=>setView('score')} style={tabStyle('score')}>Score</button>
          <button onClick={()=>setView('dashboard')} style={tabStyle('dashboard')}>Results</button>
          {isCoach && <button onClick={()=>setView('manage')} style={tabStyle('manage')}>Manage</button>}
        </div>
      </div>

      {/* ══ ROSTER TAB ══ */}
      {view === 'roster' && (
        <div style={{ padding:16 }}>
          <div style={{ color:'#94a3b8', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Day {currentDay} Check-In — tap to toggle</div>
          {activePlayers.length===0 ? emptyState('📋','No players checked in yet.') : (
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {activePlayers.map(p => {
                const ci = isCheckedIn(p.id, currentDay)
                return (
                  <button key={p.id} onClick={()=>toggleCheckin(p.id,currentDay)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:10, border:'none', background:ci?G+'20':'#0f172a', cursor:'pointer', textAlign:'left', width:'100%', borderLeft:'4px solid '+(ci?G:'#334155') }}>
                    <PlayerPhoto player={p} size={42} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:13, fontWeight:700, color:Y, background:G, padding:'0 5px', borderRadius:3 }}>#{p.pinnie_num}</span>
                        <span style={{ color:ci?'#f1f5f9':'#64748b', fontSize:14, fontWeight:600 }}>{p.first_name} {p.last_name}</span>
                      </div>
                      <div style={{ color:'#64748b', fontSize:11, marginTop:1 }}>{p.pos1}{p.pos2?' / '+p.pos2:''} · {p.year}</div>
                    </div>
                    <div style={{ width:26, height:26, borderRadius:6, background:ci?G:'#1e293b', border:'2px solid '+(ci?Y:'#334155'), display:'flex', alignItems:'center', justifyContent:'center', color:Y, fontSize:14, fontWeight:700 }}>{ci?'✓':''}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ SCORING TAB ══ */}
      {view === 'score' && (
        <div style={{ padding:16 }}>
          {dayCheckedInPlayers.length===0 ? emptyState('⏳','No players checked in for Day '+currentDay+'.') : (<>
            {(() => { const ep = evalProgress.find(e=>e.id===evaluator.id); const pct = ep?.total ? ep.scored/ep.total*100 : 0; return (
              <div style={{ marginBottom:10, background:'#0f172a', borderRadius:10, padding:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ color:'#94a3b8', fontSize:11 }}>Day {currentDay}: {ep?.scored||0}/{ep?.total||0} scored</span>
                  <span style={{ color:Y, fontSize:11, fontWeight:600 }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ height:5, borderRadius:3, background:'#1e293b' }}><div style={{ height:'100%', borderRadius:3, background:'linear-gradient(90deg,'+G+','+Y+')', width:pct+'%', transition:'width 0.3s' }} /></div>
              </div>
            ) })()}
            <div style={{ display:'flex', gap:5, marginBottom:6, flexWrap:'wrap' }}>{Object.keys(POS_GROUPS).map(pg=>pillBtn(posFilter===pg,()=>setPosFilter(pg),pg))}</div>
            <div style={{ display:'flex', gap:6, marginBottom:10 }}>
              <input type="text" placeholder="Search name or #..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{ ...input, padding:'7px 10px', fontSize:13 }} />
              <button onClick={()=>setShowUnscoredOnly(!showUnscoredOnly)} style={{ padding:'7px 10px', borderRadius:8, border:'none', background:showUnscoredOnly?'#b45309':'#1e293b', color:showUnscoredOnly?'#fff':'#64748b', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>{showUnscoredOnly?'Unscored':'All'}</button>
            </div>
            {scoringPlayers.map(p => (
              <ScoringCard key={p.id} player={p}
                scoreData={getScore(evaluator.id, p.id, currentDay)}
                onScoreField={(field,val) => submitScoreField(p.id, field, val)}
                onToggleTag={(tagVal) => toggleTag(p.id, tagVal)}
                expanded={expandedPlayer===p.id}
                onToggle={()=>setExpandedPlayer(expandedPlayer===p.id?null:p.id)} />
            ))}
            {scoringPlayers.length===0 && <div style={{ textAlign:'center', padding:40, color:'#475569' }}>{showUnscoredOnly?'All scored for Day '+currentDay+'! 🎉':'No matches.'}</div>}
          </>)}
        </div>
      )}

      {/* ══ DASHBOARD TAB ══ */}
      {view === 'dashboard' && (
        <div style={{ padding:16 }}>
          {players.length===0 ? emptyState('📊','No data yet.') : (<>
            <div style={{ background:'#0f172a', borderRadius:12, padding:12, marginBottom:14 }}>
              <div style={{ color:'#94a3b8', fontSize:10, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Day {currentDay} Progress</div>
              {evalProgress.map(ep => { const pct = ep.total ? ep.scored/ep.total*100 : 0; return (
                <div key={ep.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <div style={{ width:72, fontSize:11, color:'#94a3b8' }}>{ep.name}</div>
                  <div style={{ flex:1, height:6, borderRadius:3, background:'#1e293b' }}><div style={{ height:'100%', borderRadius:3, background:pct===100?G:'#334155', width:pct+'%' }} /></div>
                  <div style={{ width:40, textAlign:'right', fontSize:11, color:pct===100?Y:'#64748b', fontWeight:600 }}>{ep.scored}/{ep.total}</div>
                </div>) })}
            </div>

            <div style={{ display:'flex', gap:5, marginBottom:6, flexWrap:'wrap' }}>
              {Object.keys(POS_GROUPS).map(pg=>pillBtn(posFilter===pg,()=>setPosFilter(pg),pg))}
              {pillBtn(showCutPlayers,()=>setShowCutPlayers(!showCutPlayers), showCutPlayers?'Showing Cut':'Show Cut')}
            </div>
            <div style={{ display:'flex', gap:5, marginBottom:12, flexWrap:'wrap' }}>
              <span style={{ color:'#475569', fontSize:10, alignSelf:'center' }}>Sort:</span>
              {[['num','#'],['avg','Avg'],['game','Game'],['intangibles','Intang.'],['name','Name']].map(([k,l])=>(
                <button key={k} onClick={()=>setSortBy(k)} style={{ padding:'3px 8px', borderRadius:6, border:'1px solid '+(sortBy===k?Y+'60':'#1e293b'), background:sortBy===k?'#1e293b':'transparent', color:sortBy===k?Y:'#475569', fontSize:10, fontWeight:600, cursor:'pointer' }}>{l}</button>
              ))}
            </div>

            {filteredDashboard.map((p, i) => {
              const rank = (sortBy!=='num'&&sortBy!=='name') ? i+1 : null
              const isExp = expandedDash===p.id
              const isCut = p.status==='cut'
              return (
                <div key={p.id} style={{ background:isCut?'#7f1d1d08':'#0f172a', borderRadius:10, border:'1px solid '+(isCut?'#7f1d1d30':'#1e293b'), overflow:'hidden', opacity:isCut?0.5:1, marginBottom:6 }}>
                  <button onClick={()=>setExpandedDash(isExp?null:p.id)} style={{ width:'100%', border:'none', background:'transparent', padding:'10px 12px', display:'flex', alignItems:'center', gap:7, cursor:'pointer', textAlign:'left' }}>
                    {rank && <div style={{ color:'#475569', fontFamily:"'Oswald',sans-serif", fontSize:14, fontWeight:700, width:20 }}>{rank}</div>}
                    <PlayerPhoto player={p} size={34} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
                        <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:12, fontWeight:700, color:Y, background:G, padding:'0 4px', borderRadius:3 }}>#{p.pinnie_num}</span>
                        <span style={{ color:'#f1f5f9', fontSize:13, fontWeight:600 }}>{p.first_name} {p.last_name}</span>
                        {isCut && <span style={{ fontSize:9, background:'#7f1d1d', color:'#fca5a5', padding:'1px 5px', borderRadius:3, fontWeight:600 }}>CUT D{p.cut_after_day}</span>}
                      </div>
                      <div style={{ color:'#64748b', fontSize:10, marginTop:1 }}>{p.pos1}{p.pos2?' / '+p.pos2:''} · {p.year}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                      {['Game','Intng','Avg'].map((lbl,li) => {
                        const val = li===0?p.avgGame:li===1?p.avgInt:p.avgTotal
                        return <div key={lbl} style={{ textAlign:'center' }}><div style={{ fontSize:8, color:'#475569', textTransform:'uppercase' }}>{lbl}</div><div style={{ fontSize:li===2?15:13, fontWeight:700, fontFamily:li===2?"'Oswald',sans-serif":"inherit", color:val!=null?(val>=7?Y:'#e2e8f0'):'#334155' }}>{val?.toFixed(1)??'—'}</div></div>
                      })}
                    </div>
                    {!isCut && <RecButtons playerId={p.id} />}
                  </button>
                  {isExp && (
                    <div style={{ padding:'6px 12px 12px', borderTop:'1px solid #1e293b' }}>
                      {p.phone && <div style={{ fontSize:12, color:'#64748b', marginBottom:6 }}>📱 {p.phone}</div>}
                      {/* Recommendations from all evaluators */}
                      {p.recommendations.length > 0 && (
                        <div style={{ marginBottom:8 }}>
                          <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:4 }}>Day {currentDay} Recommendations</div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                            {p.recommendations.map((r,ri) => (
                              <span key={ri} style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:r.rec==='keep'?G+'30':'#7f1d1d30', color:r.rec==='keep'?Y:'#fca5a5', fontWeight:600 }}>
                                {r.name}: {r.rec==='keep'?'✓ KEEP':'✗ CUT'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:4 }}>Scores by Day</div>
                      <div style={{ display:'flex', gap:10, marginBottom:8, flexWrap:'wrap' }}>
                        {[1,2,3,4].map(d => { const bd = p.byDay[d]; return bd ? (
                          <div key={d} style={{ background:'#1e293b', padding:'4px 8px', borderRadius:6, fontSize:12 }}>
                            <span style={{ color:'#64748b', fontWeight:600 }}>D{d}:</span> <span style={{ color:'#e2e8f0' }}>{bd.avgGame.toFixed(1)}/{bd.avgInt.toFixed(1)}</span> <span style={{ color:'#475569' }}>({bd.count})</span>
                          </div>
                        ) : null })}
                      </div>
                      {/* Tags summary */}
                      {Object.keys(p.tagCounts).length > 0 && (
                        <div style={{ marginBottom:8 }}>
                          <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:4 }}>Tags (count = # of evaluators)</div>
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                            {Object.entries(p.tagCounts).sort((a,b)=>b[1]-a[1]).map(([tag,count]) => {
                              const tagInfo = POS_TAGS.find(t=>t.val===tag)
                              const isPos = tagInfo?.pos ?? !tag.startsWith('-')
                              return <span key={tag} style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:isPos?G+'25':'#7f1d1d25', color:isPos?'#6ee7b7':'#fca5a5', fontWeight:600 }}>
                                {tagInfo?.label||tag} {count>1?'×'+count:''}
                              </span>
                            })}
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:4 }}>Days Checked In: {p.daysCheckedIn.map(d=>'D'+d).join(', ')||'None'}</div>
                      {p.allNotes.length > 0 && (<div style={{ marginTop:6 }}><div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:4 }}>Notes</div>{p.allNotes.map((n,ni)=>(<div key={ni} style={{ color:'#94a3b8', fontSize:12, marginBottom:3 }}><span style={{ color:'#64748b', fontWeight:600 }}>{n.name} (D{n.day}):</span> {n.note}</div>))}</div>)}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Summary */}
            <div style={{ marginTop:16, background:'#0f172a', borderRadius:12, padding:14, display:'flex', justifyContent:'space-around', textAlign:'center' }}>
              <div><div style={{ color:Y, fontSize:26, fontWeight:700, fontFamily:"'Oswald',sans-serif" }}>{activePlayers.length}</div><div style={{ color:'#94a3b8', fontSize:10, textTransform:'uppercase' }}>Active</div></div>
              <div><div style={{ color:'#f87171', fontSize:26, fontWeight:700, fontFamily:"'Oswald',sans-serif" }}>{players.filter(p=>p.status==='cut').length}</div><div style={{ color:'#94a3b8', fontSize:10, textTransform:'uppercase' }}>Cut</div></div>
            </div>
          </>)}
        </div>
      )}

      {/* ══ MANAGE TAB (Coach only) ══ */}
      {view === 'manage' && isCoach && (
        <div style={{ padding:16 }}>
          <div style={{ background:'#0f172a', borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ color:'#94a3b8', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Day Navigation</div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:48, fontWeight:700, color:Y, fontFamily:"'Oswald',sans-serif" }}>{currentDay}</div>
              <div style={{ flex:1 }}>
                <div style={{ color:'#e2e8f0', fontSize:14, fontWeight:600 }}>Day {currentDay} of 4</div>
                <div style={{ color:'#64748b', fontSize:12 }}>{dayCheckedInPlayers.length} checked in today</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {currentDay > 1 && <button onClick={()=>goToDay(currentDay-1)} style={{ padding:'10px 14px', borderRadius:8, border:'1px solid #334155', background:'transparent', color:'#94a3b8', fontSize:14, fontWeight:700, fontFamily:"'Oswald',sans-serif", cursor:'pointer' }}>← DAY {currentDay-1}</button>}
                {currentDay < 4 && <button onClick={()=>{if(confirm('Move to Day '+(currentDay+1)+'?'))goToDay(currentDay+1)}} style={{ padding:'10px 14px', borderRadius:8, border:'none', background:Y, color:G, fontSize:14, fontWeight:700, fontFamily:"'Oswald',sans-serif", cursor:'pointer' }}>DAY {currentDay+1} →</button>}
              </div>
            </div>
          </div>

          <div style={{ background:'#0f172a', borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ color:'#94a3b8', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Evaluator Access Codes</div>
            <div style={{ color:'#64748b', fontSize:12, marginBottom:10 }}>Text each captain their code.</div>
            {evaluators.map(ev => (
              <div key={ev.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1e293b' }}>
                <div style={{ flex:1, color:'#e2e8f0', fontSize:14, fontWeight:600 }}>{ev.name}</div>
                <div style={{ fontFamily:"'Oswald',sans-serif", fontSize:16, fontWeight:700, color:Y, background:G, padding:'2px 10px', borderRadius:6, letterSpacing:1 }}>{ev.access_code}</div>
              </div>
            ))}
          </div>

          <div style={{ background:'#0f172a', borderRadius:12, padding:16 }}>
            <div style={{ color:'#94a3b8', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Make Cuts</div>
            <div style={{ color:'#64748b', fontSize:12, marginBottom:12 }}>Cut players who won't continue. This can be undone.</div>
            {activePlayers.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1e293b' }}>
                <PlayerPhoto player={p} size={32} />
                <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:12, fontWeight:700, color:Y }}>#{p.pinnie_num}</span>
                <div style={{ flex:1, color:'#e2e8f0', fontSize:13, fontWeight:600 }}>{p.first_name} {p.last_name}</div>
                <button onClick={()=>{if(confirm('Cut '+p.first_name+' '+p.last_name+'?'))cutPlayer(p.id)}} style={{ padding:'5px 12px', borderRadius:6, border:'none', background:'#7f1d1d', color:'#fca5a5', fontSize:11, fontWeight:600, cursor:'pointer' }}>CUT</button>
              </div>
            ))}
            {players.filter(p=>p.status==='cut').length > 0 && (<>
              <div style={{ color:'#94a3b8', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginTop:16, marginBottom:8 }}>Cut Players</div>
              {players.filter(p=>p.status==='cut').map(p => (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1e293b', opacity:0.6 }}>
                  <PlayerPhoto player={p} size={32} />
                  <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:12, fontWeight:700, color:'#64748b' }}>#{p.pinnie_num}</span>
                  <div style={{ flex:1, color:'#64748b', fontSize:13 }}>{p.first_name} {p.last_name} <span style={{ fontSize:10 }}>(cut D{p.cut_after_day})</span></div>
                  <button onClick={()=>uncutPlayer(p.id)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #334155', background:'transparent', color:'#94a3b8', fontSize:11, fontWeight:600, cursor:'pointer' }}>UNDO</button>
                </div>
              ))}
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════
export default function App() {
  const [mode, setMode] = useState('landing')
  const [evaluator, setEvaluator] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkin') !== null) setMode('player')
    const code = params.get('code')
    if (code) {
      supabase.from('evaluators').select('*').eq('access_code', code.toUpperCase()).single()
        .then(({ data }) => { if (data) { setEvaluator(data); setMode('eval') } })
    }
  }, [])

  if (mode === 'player') return <PlayerCheckIn onBack={()=>setMode('landing')} />
  if (mode === 'eval-login') return <EvalLogin onLogin={ev=>{setEvaluator(ev);setMode('eval')}} onBack={()=>setMode('landing')} />
  if (mode === 'eval' && evaluator) return <EvalView evaluator={evaluator} onLogout={()=>{setEvaluator(null);setMode('landing')}} />

  return (
    <div style={{ minHeight:'100vh', background:'#020617', display:'flex', flexDirection:'column' }}>
      <div style={{ background:G, padding:'40px 24px', textAlign:'center' }}>
        <div style={{ fontSize:14, color:'#ffffffaa', textTransform:'uppercase', letterSpacing:3, marginBottom:6 }}>University of Oregon</div>
        <div style={{ fontSize:36, fontWeight:700, color:Y, fontFamily:"'Oswald',sans-serif", letterSpacing:1 }}>CLUB SOCCER TRYOUTS</div>
        <div style={{ fontSize:14, color:'#ffffffcc', marginTop:8 }}>Fall 2026</div>
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:32 }}>
        <button onClick={()=>setMode('player')} style={{ width:'100%', maxWidth:340, padding:20, borderRadius:14, border:'none', background:G, color:Y, fontSize:20, fontWeight:700, fontFamily:"'Oswald',sans-serif", letterSpacing:1, cursor:'pointer', boxShadow:'0 4px 24px '+G+'60' }}>I'M A PLAYER — CHECK IN</button>
        <button onClick={()=>setMode('eval-login')} style={{ width:'100%', maxWidth:340, padding:20, borderRadius:14, border:'2px solid #334155', background:'#0f172a', color:'#94a3b8', fontSize:18, fontWeight:700, fontFamily:"'Oswald',sans-serif", letterSpacing:1, cursor:'pointer' }}>COACH / CAPTAIN LOGIN</button>
      </div>
    </div>
  )
}
