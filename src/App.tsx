import { EditorPage } from './editor/EditorPage'
import { NewPage } from './editor/NewPage'
import { LibraryDrillPage } from './app/LibraryDrillPage'
import { LibraryPage } from './app/LibraryPage'
import { SharedPage } from './app/SharedPage'
import { useRoute } from './app/useRoute'
import { libraryHash } from './app/route'

export default function App() {
  const route = useRoute()

  return (
    <main>
      <header>
        <h1>
          <a href={libraryHash()}>Hockey Drills</a>
        </h1>
      </header>
      {route.kind === 'library' && <LibraryPage />}
      {route.kind === 'drill' && <LibraryDrillPage id={route.id} />}
      {route.kind === 'shared' && <SharedPage data={route.data} />}
      {route.kind === 'edit' && <EditorPage id={route.id} />}
      {route.kind === 'new' && <NewPage />}
    </main>
  )
}
