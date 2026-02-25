export interface OpenedFile {
  handle: FileSystemFileHandle
  name: string
}

export async function openFile(): Promise<OpenedFile | null> {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Markdown files',
          accept: { 'text/markdown': ['.md', '.markdown'] },
        },
      ],
      multiple: false,
    })
    return { handle, name: handle.name }
  } catch (err) {
    // User cancelled the picker — not an error
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

export async function readFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

export async function writeFile(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}
