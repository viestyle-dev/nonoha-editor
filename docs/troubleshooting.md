# Troubleshooting Guide

This document provides solutions for common issues related to node and edge management in the nonoha-engine editor.

## Copy/Paste Issues

### Problem: Edges not appearing after paste

**Symptoms:**
- Nodes paste correctly but edges don't appear
- Edges appear only after browser reload
- Console shows successful API calls but no UI update

**Root Cause Analysis:**
1. **ID Mismatch**: React Flow edge source/target doesn't match actual node IDs
2. **Handle Inconsistency**: sourceHandle/targetHandle incorrectly set for input/output nodes
3. **State Update Missing**: React Flow edges state not updated after Engine API call

**Solution Steps:**

1. **Verify Node ID Conversion**:
```typescript
// Check if node IDs are correctly mapped
console.log('Name mapping:', nameMapping)
console.log('React Flow nodes:', nodes.map(n => n.id))
```

2. **Validate Edge Format**:
```typescript
// Verify edge object structure
console.log('Created edge objects:', newEdgeObjects)
console.log('Expected format:', {
  id: 'edge_id',
  source: 'source_node_id', // Must match actual React Flow node ID
  target: 'target_node_id', // Must match actual React Flow node ID
  sourceHandle: 'port_handle_or_undefined',
  targetHandle: 'port_handle_or_undefined'
})
```

3. **Check Handle ID Rules**:
```typescript
// Input nodes: sourceHandle must be undefined
// Output nodes: targetHandle must be undefined
if (sourceNodeType === 'input') {
  reactFlowSourceHandle = undefined // ✓ Correct
} else {
  reactFlowSourceHandle = sourceParsed.portHandle // ✓ Correct
}

if (targetNodeType === 'output') {
  reactFlowTargetHandle = undefined // ✓ Correct
} else {
  reactFlowTargetHandle = targetParsed.portHandle // ✓ Correct
}
```

### Problem: Wrong edge IDs causing duplicates

**Symptoms:**
- Multiple edges with same visual connection
- Edges not removable from UI
- State inconsistency between UI and backend

**Solution:**
Ensure edge ID matches Engine API format:
```typescript
// Engine API response format: { source: "nodeA.port1", target: "nodeB.port2" }
// React Flow edge ID should be: "nodeA.port1-nodeB.port2"

const edgeId = `${engineSource}-${engineTarget}`
// NOT: `${reactFlowSource}-${reactFlowTarget}`
```

## Node Creation Issues

### Problem: Input/Output ports not displaying correctly

**Symptoms:**
- Port nodes appear with wrong names
- Port data types not preserved
- Handle connections fail

**Root Cause:**
Mismatch between Engine API port names and React Flow node IDs

**Solution:**
```typescript
// During paste, extract actual port name from created node ID
const actualPortName = nodeType === 'input' 
  ? createdNode.name.slice('$input:'.length)  // Extract port name
  : createdNode.name.slice('$output:'.length) // Extract port name

// Use actual port name for both label and port.name
nodeObject = {
  id: createdNode.name,
  data: {
    label: actualPortName,           // ✓ Shows actual created name
    port: {
      name: actualPortName,          // ✓ Matches Engine API
      values: originalNodeData.portData?.values || [{ type: 'any' }]
    }
  }
}
```

### Problem: Editor node settings not preserved

**Symptoms:**
- Editor nodes paste without their configuration
- Internal state lost during copy/paste
- Size information not preserved

**Solution:**
All editor node settings are passed via `props.data` from `page.tsx`. Nodes should:

1. Initialize state from `props.data`
2. Sync state when `props.data` changes (for copy/paste)
3. Only call `patchNodeData()` when user modifies settings

```typescript
// Initialize from props.data (passed by page.tsx)
const [comment, setComment] = useState(props.data.comment || "")

// Sync when props.data changes (e.g., after copy/paste)
useEffect(() => {
  if (props.data.comment !== undefined) {
    setComment(props.data.comment)
  }
}, [props.data.comment])

// Update function for immediate UI response
const updateNodeData = useCallback((newData: Partial<CommentNode['data']>) => {
  setNodes(nodes =>
    nodes.map(node =>
      node.id === props.id
        ? { ...node, data: { ...node.data, ...newData } }
        : node
    )
  )
}, [props.id, setNodes])

// Save to backend only when user modifies settings
const saveComment = (newComment: string) => {
  updateNodeData({ comment: newComment })
  editorModelUpdater.patchNodeData(props.id, { comment: newComment })
}
```

**Note:** Editor nodes do NOT call `getNodeData()` for initial loading. All settings are passed via `props.data` at construction time from `page.tsx`.

## API Integration Issues

### Problem: Engine API calls failing

**Symptoms:**
- Network errors in console
- Nodes/edges not created in backend
- Inconsistent state after reload

**Debugging Steps:**

1. **Check API Endpoints**:
```typescript
// Verify correct URL construction
const url = `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/nodes`
console.log('API URL:', url)
```

2. **Validate Request Format**:
```typescript
// Check request body matches API expectations
const requestBody = {
  name: "port_name",
  values: [{ type: "data_type" }]
}
console.log('Request body:', JSON.stringify(requestBody, null, 2))
```

3. **Monitor Response**:
```typescript
const response = await fetch(url, { method: 'POST', ... })
console.log('Response status:', response.status)
console.log('Response body:', await response.text())
```

### Problem: Data type mismatches

**Symptoms:**
- Port connections fail
- Type validation errors
- Runtime type errors

**Solution:**
Ensure consistent type handling:
```typescript
// Validate port value types
const validatePortType = (type: string): boolean => {
  const validTypes = ['i8', 'u8', 'i32', 'u32', 'i64', 'u64', 'f32', 'f64', 'bool', 'str']
  return validTypes.includes(type)
}

// Preserve type information during copy/paste
const values = nodeData?.port?.values || [{ type: "any" }]
// Ensure values array structure is maintained
```

## Performance Issues

### Problem: Slow copy/paste operations

**Symptoms:**
- Long delays during paste
- UI freezing
- Memory consumption spikes

**Optimization Strategies:**

1. **Batch API Calls**:
```typescript
// Create all nodes first, then edges
const nodePromises = clipboardData.nodes.map(createNode)
await Promise.all(nodePromises)

const edgePromises = clipboardData.edges.map(createEdge)
await Promise.all(edgePromises)
```

2. **Minimize State Updates**:
```typescript
// Single state update instead of multiple
setNodes(prevNodes => [...prevNodes, ...allNewNodes])
setEdges(prevEdges => [...prevEdges, ...allNewEdges])
// NOT: multiple individual updates
```

3. **Use React.memo and useCallback**:
```typescript
// Prevent unnecessary re-renders
const MyNode = memo((props: NodeProps) => { ... })

const handleUpdate = useCallback((data) => {
  // Update logic
}, [dependencies])
```

## State Synchronization Issues

### Problem: React Flow state out of sync with Engine

**Symptoms:**
- UI shows different data than backend
- Inconsistencies after page reload
- Edge connections not matching Engine state

**Debugging:**

1. **Compare States**:
```typescript
// Check React Flow state
console.log('React Flow nodes:', nodes)
console.log('React Flow edges:', edges)

// Check Engine state (after reload)
const engineNodes = await fetchGraphNodes(engineGatewayUrl, graphName)
const engineEdges = await fetchGraphEdges(engineGatewayUrl, graphName)
console.log('Engine nodes:', engineNodes)
console.log('Engine edges:', engineEdges)
```

2. **Validate ID Mappings**:
```typescript
// Ensure IDs are consistent
const reactFlowNodeIds = new Set(nodes.map(n => n.id))
const engineNodeIds = new Set([
  ...engineNodes.map(n => n.name),
  ...engineInputs.map(i => `$input:${i.name}`),
  ...engineOutputs.map(o => `$output:${o.name}`)
])

console.log('Missing in React Flow:', 
  [...engineNodeIds].filter(id => !reactFlowNodeIds.has(id)))
console.log('Extra in React Flow:', 
  [...reactFlowNodeIds].filter(id => !engineNodeIds.has(id)))
```

## Common Error Messages

### "TypeError: editorModelUpdater.getNodeData is not a function"

**Cause:** Object reference lost during JSON serialization

**Solution:**
```typescript
// Inject live references during paste
if (editorModelUpdaterRef.current) {
  const liveUpdater = editorModelUpdaterRef.current
  // Use liveUpdater instead of serialized reference
}
```

### "Property 'values' does not exist on type '{}'"

**Cause:** TypeScript type mismatch

**Solution:**
```typescript
// Use proper type assertion
const nodeData = node.data as { port?: { values?: { type: string }[] } }
const values = nodeData?.port?.values || [{ type: "any" }]
```

### "Failed to create edge: 400 Bad Request"

**Cause:** Invalid edge format sent to Engine API

**Solution:**
```typescript
// Verify edge format matches Engine expectations
// Input to Node: { source: ".inputName", target: "nodeName.portName" }
// Node to Output: { source: "nodeName.portName", target: ".outputName" }
// Node to Node: { source: "nodeA.portName", target: "nodeB.portName" }
```

## Development Tools

### Debug Logging

Add comprehensive logging during development:
```typescript
const DEBUG_COPY_PASTE = true

if (DEBUG_COPY_PASTE) {
  console.group('Copy/Paste Debug')
  console.log('Original data:', clipboardData)
  console.log('Name mapping:', nameMapping)
  console.log('Created nodes:', createdNodes)
  console.log('Created edges:', createdEdgeResults)
  console.log('React Flow objects:', { newNodeObjects, newEdgeObjects })
  console.groupEnd()
}
```

### State Inspector

Create a debug component to inspect state:
```typescript
const StateInspector = () => {
  const { nodes, edges } = useReactFlow()
  
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, background: 'white', padding: 10 }}>
      <h4>Debug Info</h4>
      <div>Nodes: {nodes.length}</div>
      <div>Edges: {edges.length}</div>
      <details>
        <summary>Node IDs</summary>
        <pre>{JSON.stringify(nodes.map(n => n.id), null, 2)}</pre>
      </details>
      <details>
        <summary>Edge IDs</summary>
        <pre>{JSON.stringify(edges.map(e => e.id), null, 2)}</pre>
      </details>
    </div>
  )
}
```

### Network Monitoring

Monitor API calls in browser DevTools:
1. Open Network tab
2. Filter by "XHR/Fetch"
3. Look for requests to `/node-flow/graphs/`
4. Check request/response formats

## Best Practices

### Code Organization

1. **Separate concerns**: Keep API logic separate from UI logic
2. **Type safety**: Use TypeScript interfaces for all data structures
3. **Error handling**: Implement comprehensive error catching
4. **Testing**: Add unit tests for ID conversion functions

### Debugging Workflow

1. **Reproduce issue**: Create minimal test case
2. **Add logging**: Enable debug output
3. **Check each layer**: API → State → UI
4. **Validate assumptions**: Verify ID formats and conversions
5. **Test edge cases**: Empty data, missing nodes, etc.

This troubleshooting guide should help identify and resolve most common issues with the node and edge management system.