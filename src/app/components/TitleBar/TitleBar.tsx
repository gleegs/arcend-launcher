import { Settings, Minus, X } from 'lucide-react'
import { useWindowStore } from '../../store/window'
import { useSettingsStore } from '../../store/settings'
import Button from '../Button/Button'
import HoverLabel from '../HoverLabel/HoverLabel'

export default function TitleBar() {
  const minimize = useWindowStore((s) => s.minimize)
  const close = useWindowStore((s) => s.close)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)

  return (
    <div className="space-x-3">
      <Button onClick={toggleSettings} className="group/label relative p-2">
        <Settings />
        <HoverLabel side="bottom">Paramètres</HoverLabel>
      </Button>
      <Button onClick={minimize} className="group/label relative p-2">
        <Minus />
        <HoverLabel side="bottom">Réduire</HoverLabel>
      </Button>
      <Button onClick={close} className="group/label relative p-2">
        <X />
        <HoverLabel side="bottom">Fermer</HoverLabel>
      </Button>
    </div>
  )
}
