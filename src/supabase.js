import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Compress a photo before uploading (resize to 400x400, JPEG quality 0.7)
export async function compressPhoto(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 400
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        // Center-crop to square
        const min = Math.min(img.width, img.height)
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// Upload player photo to Supabase Storage
export async function uploadPhoto(playerId, file) {
  const compressed = await compressPhoto(file)
  const path = `${playerId}.jpg`
  const { error } = await supabase.storage
    .from('player-photos')
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('player-photos').getPublicUrl(path)
  return data.publicUrl
}
