export function chunkMessage(text: string, maxLength = 4000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by double newline first to preserve paragraphs/tables
  const paragraphs = text.split("\n\n");

  for (const paragraph of paragraphs) {
    // If a single paragraph is still too big, we have to split it by lines
    if (paragraph.length > maxLength) {
      const lines = paragraph.split("\n");
      for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxLength) {
          chunks.push(currentChunk.trim());
          currentChunk = line + "\n";
        } else {
          currentChunk += line + "\n";
        }
      }
    } else {
      if (currentChunk.length + paragraph.length + 2 > maxLength) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph + "\n\n";
      } else {
        currentChunk += paragraph + "\n\n";
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
