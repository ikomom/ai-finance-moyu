import { render } from 'solid-js/web'
import { installBootDiagnostics } from './boot'
import { CopilotApp } from './components/copilot/CopilotApp'
import './components/agent/AgentDrawer.css'
import './components/copilot/Copilot.css'

installBootDiagnostics()

const root = document.getElementById('root')
if (root) render(() => <CopilotApp />, root)
