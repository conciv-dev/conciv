import {createRoute} from '@tanstack/solid-router'
import {type JSX} from 'solid-js'
import {uniq} from 'es-toolkit'
import {Stage, StageToolbar, zoomStep} from '../stage.js'
import {layoutRoute, useXrayPage} from './layout.js'

export const captureRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'capture',
  component: XrayCapture,
})

function XrayCapture(): JSX.Element {
  const page = useXrayPage()
  return (
    <div class="mt-4 border border-base rounded-lg bg-base flex flex-col h-[calc(100dvh-13rem)] min-h-96 overflow-hidden">
      <StageToolbar
        mode={page.mode()}
        ran={page.ran()}
        scale={page.scale()}
        fitted={page.view.zoom === null}
        boxes={page.view.boxes}
        onMode={page.chooseMode}
        onZoom={(direction) => page.zoom(zoomStep({scale: page.scale(), direction}))}
        onToggleZoom={() => page.zoom(page.view.zoom === null ? 1 : null)}
        onBoxes={page.setBoxes}
      />
      <Stage
        mode={page.mode()}
        rows={page.rows()}
        selected={page.selected()}
        images={page.loaded().images}
        target={page.loaded().target}
        view={page.view}
        scale={page.scale()}
        fitted={page.view.zoom === null}
        actions={{
          zoom: page.zoom,
          slide: (value) => page.setView('slider', value),
          measure: (canvas) => page.setView('canvas', canvas),
          loaded: (src) => page.setView('loaded', (list) => uniq([...list, src])),
          failed: (src) => page.setView('failed', (list) => uniq([...list, src])),
        }}
      />
    </div>
  )
}
