import { getCurrentWindow } from '@tauri-apps/api/window'
import { snapshot } from '../store'

/**
 * The window edge a resize drag starts from. Mirrors the union `startResizeDragging`
 * accepts — the API declares that type but does not export it.
 */
type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West'

/**
 * Resize handle.
 *
 * The window is frameless, so its native resize border is only a few pixels
 * wide — fiddly on a widget this small. This drives `startResizeDragging`
 * instead, which hands the drag to the window manager so the resize is smooth.
 * Adapts to bottom-left when docked at right edge to allow pulling inwards.
 */
export function Grip(props: { dir?: ResizeDirection }) {
  const isDockedRight = () => snapshot()?.dock?.edge === 'right'
  const effectiveDir = () => props.dir ?? (isDockedRight() ? 'SouthWest' : 'SouthEast')

  return (
    <div
      class="grip"
      classList={{ 'grip-left': isDockedRight() }}
      title={isDockedRight() ? '向内拖动缩放' : '拖动缩放'}
      onMouseDown={(e) => {
        e.preventDefault()
        // Keep the press from also starting a window drag.
        e.stopPropagation()
        void getCurrentWindow().startResizeDragging(effectiveDir())
      }}
    />
  )
}
