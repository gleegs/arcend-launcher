import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { LogIn, LogOut } from 'lucide-react'
import Button from '../Button/Button'
import { useAuthStore } from '../../store/auth'

export default function AuthButton() {
  const state = useAuthStore((s) => s.state)
  const isLoading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const init = useAuthStore((s) => s.init)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  if (state.status !== 'unauthenticated') {
    const profile = state.profile
    // La confirmation ne s'affiche que si le bouton est réellement survolé : le
    // clic d'activation de fenêtre (au retour du login Microsoft) n'est pas
    // précédé d'un mouseenter, donc il ne fait pas apparaître « Se déconnecter ? ».
    const showConfirm = confirmLogout && hovering
    const handleClick = () => {
      if (confirmLogout) {
        logout()
      } else {
        setConfirmLogout(true)
      }
    }
    return (
      <Button
        className={clsx(
          'flex justify-center items-center gap-2 min-w-48 relative',
          showConfirm && 'border-red-500/70! border-2'
        )}
        onClick={handleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => {
          setHovering(false)
          setConfirmLogout(false)
        }}
      >
        <div
          className={clsx(
            'flex items-center gap-2 transition-opacity duration-200',
            showConfirm && 'opacity-0'
          )}
        >
          <span className="uppercase font-black text-xs">{profile.name}</span>
          <img
            src={`https://mc-heads.net/avatar/${encodeURIComponent(profile.name)}`}
            alt={profile.name}
            className="w-5 h-5 rounded-sm"
          />
        </div>
        <div
          className={clsx(
            'absolute inset-0 flex justify-center items-center gap-2 transition-opacity duration-200',
            showConfirm ? 'opacity-100' : 'opacity-0'
          )}
        >
          <LogOut className="text-white" />
          <span className="uppercase font-black text-xs">Se déconnecter ?</span>
        </div>
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        className="flex justify-center items-center gap-2 min-w-48"
        disabled={isLoading}
        onClick={login}
      >
        <span className="uppercase font-black text-xs">Se connecter</span>
        <LogIn className="text-white" />
      </Button>
      {error && (
        <span className="text-[10px] text-red-400 max-w-48 text-center" title={error}>
          Connexion échouée — voir les logs
        </span>
      )}
    </div>
  )
}
