import { render } from 'solid-js/web'

import { Settings } from './SettingsApp'
import './settings.css'

const root = document.getElementById('root')
if (root) render(() => <Settings />, root)
