#!/bin/bash
for dir in packages/trpc/src/routers/*/; do
  router_name=$(basename "$dir")
  echo "## Router: $router_name"
  for file in "$dir"*.ts; do
    filename=$(basename "$file")
    if [ "$filename" = "index.ts" ]; then continue; fi
    proc_name="${filename%.ts}"
    
    echo "### Procedure: $proc_name"
    
    # Extract input schema
    echo "#### Input Schema:"
    awk '/export const inputSchema = z.object\(\{/,/\}\);/' "$file" | head -n 15
    
    # Extract procedure type (query/mutation)
    type=$(grep -oE '\.(query|mutation)\(' "$file" | head -n 1 | sed 's/[.(]//g')
    echo "#### Type: $type"
    echo ""
  done
done
