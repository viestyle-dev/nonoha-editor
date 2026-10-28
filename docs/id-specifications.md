# ID and Key Specifications

This document describes the ID and key specifications used throughout the nonoha-engine system for nodes, edges, and ports.

## Overview

The system consists of two main components:
1. **Editor (React Flow UI)** - Frontend interface using React Flow
2. **Engine (Backend API)** - Backend processing engine

Each component has different ID formatting requirements for proper communication and state management.

## Node ID Specifications

### Editor Side (React Flow)

Node IDs in the React Flow interface follow these patterns:

| Node Type | ID Pattern | Example | Description |
|-----------|------------|---------|-------------|
| Engine Node | `{node_name}` | `"nodeA"` | Simple node name from engine |
| Editor Node | `$editor:{id}` | `"$editor:comment_123"` | Editor-specific nodes with prefix |
| Input Port | `$input:{port_name}` | `"$input:input1"` | Graph input ports |
| Output Port | `$output:{port_name}` | `"$output:output1"` | Graph output ports |

#### Node Type Detection

```typescript
function getNodeType(nodeName: string) {
  if (nodeName.startsWith("$input:")) return "input"
  if (nodeName.startsWith("$output:")) return "output"  
  if (nodeName.startsWith("$editor:")) return "editor"
  return "node"
}
```

### Engine Side (API)

Engine API uses different naming conventions:

| Entity | Pattern | Example | Description |
|--------|---------|---------|-------------|
| Engine Node | `{node_name}` | `"nodeA"` | Direct node name |
| Input Port | `{port_name}` | `"input1"` | Port name without prefix |
| Output Port | `{port_name}` | `"output1"` | Port name without prefix |

## Edge Specifications

### Editor Side (React Flow)

React Flow edges use the following structure:

```typescript
interface ReactFlowEdge {
  id: string              // Edge identifier
  source: string          // Source node ID (React Flow format)
  target: string          // Target node ID (React Flow format)
  sourceHandle?: string   // Source port handle (undefined for input nodes)
  targetHandle?: string   // Target port handle (undefined for output nodes)
  type: "BasicNodeEdge"
  data: {
    source: { type: "node" | "editor" | "input" | "output" }
    target: { type: "node" | "editor" | "input" | "output" }
  }
}
```

#### Edge ID Generation

Edge IDs match the Engine API format:
```typescript
edgeId = `${engineSourceFormat}-${engineTargetFormat}`
```

Examples:
- Node to Node: `"nodeA.output1-nodeB.input1"`
- Input to Node: `".input1-nodeA.input1"`
- Node to Output: `"nodeA.output1-.output1"`

#### Handle ID Rules

| Node Type | sourceHandle | targetHandle |
|-----------|--------------|--------------|
| Input Node | `undefined` | N/A |
| Output Node | N/A | `undefined` |
| Engine Node | `"{port_name}"` | `"{port_name}"` |
| Editor Node | `"{port_name}"` | `"{port_name}"` |

### Engine Side (API)

Engine API expects edges in this format:

```json
{
  "source": "{source_format}",
  "target": "{target_format}"
}
```

#### Engine Edge Format Rules

| Connection Type | Source Format | Target Format | Example |
|----------------|---------------|---------------|---------|
| Input → Node | `".{input_port}"` | `"{node}.{port}"` | `".input1"` → `"nodeA.input1"` |
| Node → Output | `"{node}.{port}"` | `".{output_port}"` | `"nodeA.output1"` → `".output1"` |
| Node → Node | `"{node}.{port}"` | `"{node}.{port}"` | `"nodeA.output1"` → `"nodeB.input1"` |

## Port Specifications

### Engine Node Ports

Engine nodes have ports defined in their schema:

```typescript
interface EngineNodePort {
  name: string           // Port identifier
  values: Array<{        // Supported data types
    type: string         // Data type (e.g., "f32", "i32", "str")
  }>
}
```

### Graph Ports (Input/Output)

Graph-level ports have different structures:

#### Input Port Creation (API)
```json
POST /graphs/{graph_name}/inputs
{
  "name": "{port_name}",
  "values": [
    {
      "type": "{data_type}"
    }
  ]
}
```

#### Output Port Creation (API)
```json
POST /graphs/{graph_name}/outputs  
{
  "name": "{port_name}",
  "values": [
    {
      "type": "{data_type}"
    }
  ]
}
```

## Copy/Paste Specifications

### Clipboard Data Format

```typescript
interface ClipboardNodeData {
  name: string                    // Original node name
  type: string                    // Node type
  nodeType: "node" | "editor" | "input" | "output"
  properties: Record<string, any>
  position: { x: number, y: number }
  
  // Editor-specific data
  editorData?: {
    width?: number
    height?: number  
    data?: Record<string, unknown>
  }
  
  // Port-specific data
  portData?: {
    portName: string
    values?: Array<{ type: string }>
    defaultValue?: unknown
  }
}

interface ClipboardEdgeData {
  source: string                  // "{node_id}.{port_handle}"
  target: string                  // "{node_id}.{port_handle}"
  sourceNodeType: string
  targetNodeType: string
}
```

### Name Mapping During Paste

When pasting nodes, original names are mapped to new unique names:

```typescript
const nameMapping = new Map<string, string>()
// Example: "nodeA" → "nodeA_abc123"
//          "$input:input1" → "$input:input1_def456"
```

## Validation Rules

### Node ID Validation

1. **Engine nodes**: Must not contain special prefixes (`$input:`, `$output:`, `$editor:`)
2. **Editor nodes**: Must start with `$editor:`
3. **Port nodes**: Must start with `$input:` or `$output:`
4. **Uniqueness**: All node IDs must be unique within a graph

### Edge Validation

1. **Source/Target existence**: Referenced nodes must exist
2. **Port compatibility**: Source output type must match target input type
3. **Handle consistency**: Handle IDs must match actual node ports
4. **Circular dependency**: No cycles allowed in engine node connections

### Port Validation

1. **Name uniqueness**: Port names must be unique within their scope (input/output)
2. **Type consistency**: Port value types must be supported by the engine
3. **Connection limits**: Some ports may have connection restrictions

## Migration and Compatibility

### Version Compatibility

- **Current version**: Uses the specifications outlined above
- **Legacy support**: Older graphs may use different ID formats
- **Migration**: Automatic conversion during graph loading when necessary

### Breaking Changes

When modifying ID specifications:

1. Update this documentation
2. Implement backward compatibility or migration logic
3. Update all related functions:
   - `getNodeType()`
   - `parseEdgeEndpoint()`
   - `fetchGraphEdges()`
   - Copy/paste logic

## Implementation Notes

### Critical Functions

- **`fetchGraphEdges()`**: Converts Engine API format to React Flow format
- **`parseEdgeEndpoint()`**: Parses clipboard edge format
- **`getNodeType()`**: Determines node type from ID
- **`getEditorEdgeId()`**: Generates editor edge IDs

### Debugging Tips

1. **Console logging**: Enable edge/node ID logging during development
2. **State inspection**: Check React Flow state vs Engine state consistency  
3. **API monitoring**: Verify Engine API request/response formats
4. **Type checking**: Ensure TypeScript types match actual data structures

## Examples

### Complete Edge Creation Flow

1. **User connects nodes in UI**
2. **React Flow generates edge with React Flow IDs**
3. **Convert to Engine API format**
4. **Send API request with Engine format**
5. **Update React Flow state with consistent IDs**

Example conversion:
```typescript
// React Flow edge
{
  source: "$input:input1",    // React Flow node ID
  sourceHandle: undefined,    // No handle for input nodes
  target: "nodeA",           // React Flow node ID  
  targetHandle: "input1"     // Port handle
}

// Engine API request
{
  source: ".input1",         // Engine format: .{port_name}
  target: "nodeA.input1"     // Engine format: {node}.{port}
}

// Resulting edge ID
edgeId = ".input1-nodeA.input1"  // Used by both systems
```

This ensures consistency between the editor UI and the engine backend while accommodating the different requirements of each system.