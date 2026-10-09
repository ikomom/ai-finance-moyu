import { getCurrentWindow } from '@tauri-apps/api/window'

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
 */
export function Grip(props: { dir?: ResizeDirection }) {
  return (
    <div
      class="grip"
      title="拖动缩放"
      onMouseDown={(e) => {
        e.preventDefault()
        // Keep the press from also starting a window drag.
        e.stopPropagation()
        void getCurrentWindow().startResizeDragging(props.dir ?? 'SouthEast')
      }}
    />
  )
}
