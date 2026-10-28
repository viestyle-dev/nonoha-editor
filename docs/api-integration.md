# API Integration Guide

This document provides detailed examples of how the editor integrates with the Engine API, including actual code implementations and data transformations.

## Node Management API

### Engine Node Operations

#### Creating Engine Nodes

**API Endpoint**: `POST /node-flow/graphs/{graph_name}/nodes`

**Request Format**:
```json
{
  "type": "string",
  "preferred_name": "optional_string",
  "properties": {
    "key": "value"
  }
}
```

**Response Format**:
```json
{
  "name": "actual_node_name",
  "type": "node_type",
  "properties": { ... },
  "inputs": [
    {
      "name": "port_name",
      "values": [
        {
          "type": "data_type"
        }
      ]
    }
  ],
  "outputs": [ ... ]
}
```

**Editor Implementation**:
```typescript
const createEngineNode = async (nodeType: string, properties: object) => {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/nodes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: nodeType,
        properties: properties
      })
    }
  )
  return await response.json()
}
```

### Graph Port Operations

#### Creating Input Ports

**API Endpoint**: `POST /node-flow/graphs/{graph_name}/inputs`

**Request Format**:
```json
{
  "name": "port_name",
  "values": [
    {
      "type": "data_type"
    }
  ]
}
```

**Editor Implementation**:
```typescript
const createInputPort = async (portName: string, dataTypes: string[]) => {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/inputs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: portName,
        values: dataTypes.map(type => ({ type }))
      })
    }
  )
  return await response.json()
}
```

#### Creating Output Ports

**API Endpoint**: `POST /node-flow/graphs/{graph_name}/outputs`

**Request Format**:
```json
{
  "name": "port_name", 
  "values": [
    {
      "type": "data_type"
    }
  ]
}
```

## Edge Management API

### Creating Edges

**API Endpoint**: `POST /node-flow/graphs/{graph_name}/edges`

**Request Format**:
```json
{
  "source": "source_specification",
  "target": "target_specification"
}
```

### Edge Format Conversion

The editor must convert React Flow edge format to Engine API format:

#### Input → Node Connection

**React Flow Edge**:
```typescript
{
  source: "$input:input_port_name",  // React Flow input node ID
  sourceHandle: undefined,           // No handle for input nodes
  target: "engine_node_name",        // Engine node name
  targetHandle: "input_port_name"    // Target port on engine node
}
```

**Engine API Request**:
```json
{
  "source": ".input_port_name",           // Engine input format
  "target": "engine_node_name.input_port_name"  // Engine node.port format
}
```

**Implementation**:
```typescript
const createInputToNodeEdge = (inputPortName: string, targetNode: string, targetPort: string) => {
  return {
    source: `.${inputPortName}`,
    target: `${targetNode}.${targetPort}`
  }
}
```

#### Node → Output Connection

**React Flow Edge**:
```typescript
{
  source: "engine_node_name",           // Engine node name
  sourceHandle: "output_port_name",     // Source port on engine node
  target: "$output:output_port_name",   // React Flow output node ID
  targetHandle: undefined               // No handle for output nodes
}
```

**Engine API Request**:
```json
{
  "source": "engine_node_name.output_port_name",  // Engine node.port format
  "target": ".output_port_name"                   // Engine output format
}
```

#### Node → Node Connection

**React Flow Edge**:
```typescript
{
  source: "source_node_name",          // Source engine node
  sourceHandle: "output_port_name",    // Source port
  target: "target_node_name",          // Target engine node  
  targetHandle: "input_port_name"      // Target port
}
```

**Engine API Request**:
```json
{
  "source": "source_node_name.output_port_name",
  "target": "target_node_name.input_port_name"
}
```

## Data Fetching API

### Fetching Graph Structure

#### Getting All Nodes

**API Endpoint**: `GET /node-flow/graphs/{graph_name}/nodes`

**Response Format**:
```json
[
  {
    "name": "node_name",
    "type": "node_type", 
    "properties": { ... },
    "inputs": [ ... ],
    "outputs": [ ... ]
  }
]
```

#### Getting All Edges

**API Endpoint**: `GET /node-flow/graphs/{graph_name}/edges`

**Response Format**:
```json
[
  {
    "source": "source_specification",
    "target": "target_specification"
  }
]
```

**Editor Conversion**:
```typescript
const fetchGraphEdges = async (engineGatewayUrl: string, graphName: string): Promise<BasicEdge[]> => {
  const edgesData: { source: string; target: string }[] = await (
    await fetch(`http://${engineGatewayUrl}/node-flow/graphs/${graphName}/edges`)
  ).json()

  return edgesData.map(edge => {
    const [sourceNode, ...sourcePortParts] = edge.source.split(".")
    const [targetNode, ...targetPortParts] = edge.target.split(".")

    if (sourceNode !== "" && targetNode !== "") {
      // Node to Node
      return {
        id: `${edge.source}-${edge.target}`,
        source: sourceNode,
        sourceHandle: sourcePortParts.join("."),
        target: targetNode,
        targetHandle: targetPortParts.join("."),
        type: "BasicNodeEdge",
        data: {
          source: { type: "node" },
          target: { type: "node" },
        },
      } as BasicEdge
    } else if (sourceNode !== "" && targetNode === "") {
      // Node to Output
      return {
        id: `${edge.source}-${edge.target}`,
        source: sourceNode,
        sourceHandle: sourcePortParts.join("."),
        target: `$output:${targetPortParts.join(".")}`,
        type: "BasicNodeEdge",
        data: {
          source: { type: "node" },
          target: { type: "output" },
        },
      } as BasicEdge
    } else if (sourceNode === "" && targetNode !== "") {
      // Input to Node
      return {
        id: `${edge.source}-${edge.target}`,
        source: `$input:${sourcePortParts.join(".")}`,
        target: targetNode,
        targetHandle: targetPortParts.join("."),
        type: "BasicNodeEdge",
        data: {
          source: { type: "input" },
          target: { type: "node" },
        },
      } as BasicEdge
    }

    throw new Error("Invalid edge")
  })
}
```

#### Getting Graph Inputs

**API Endpoint**: `GET /node-flow/graphs/{graph_name}/inputs`

**Response Format**:
```json
[
  {
    "name": "input_name",
    "values": [
      {
        "type": "data_type"
      }
    ]
  }
]
```

#### Getting Graph Outputs

**API Endpoint**: `GET /node-flow/graphs/{graph_name}/outputs`

**Response Format**:
```json
[
  {
    "name": "output_name", 
    "values": [
      {
        "type": "data_type"
      }
    ]
  }
]
```

## Editor Node Data Loading

### Architecture Overview

Editor node settings are loaded once in `page.tsx` and passed to nodes via `props.data`. Nodes do NOT call `getNodeData()` individually, eliminating N+1 API calls.

**Data Flow:**

```text
page.tsx: fetch nodesSettings (includes data object)
    ↓
editorNodes construction: spread settings.data into props.data
    ↓
Each Node: read from props.data (no API call needed)
    ↓
User modifies settings: call patchNodeData() to persist
```

### Implementation in page.tsx

```typescript
// Fetch all node settings including persisted data
const nodesSettings: {
  [key: string]: {
    x?: number
    y?: number
    width?: number
    height?: number
    type?: string
    data?: Record<string, unknown>  // Contains graphWidth, yMin, yMax, etc.
  }
} = await fetch(`${editorModelUrl}?query=nodes`).then(r => r.json())

// Build editor nodes with all settings passed via data
const node = {
  id: nodeName,
  data: {
    ...settings.data,  // Spread persisted settings (graphWidth, yMin, etc.)
    label: nodeName,
    graphEndpoint,
    editorModelUpdater,
  },
}
```

### Node Component Pattern

```typescript
// Initialize from props.data
const [yMin, setYMin] = useState<number | undefined>(props.data.yMin as number | undefined)

// Sync when props.data changes (for copy/paste scenarios)
useEffect(() => {
  if (props.data.yMin !== undefined) {
    setYMin(props.data.yMin)
  }
}, [props.data.yMin])

// Only call API when user modifies settings
const applySettings = () => {
  updateNodeData({ yMin })
  editorModelUpdater.patchNodeData(props.id, { yMin })
}
```

### Benefits

- **No N+1 API calls**: All settings loaded in single batch
- **No race conditions**: Data available at construction time
- **Simpler node code**: No useEffect for initial data fetching
- **Copy/paste compatibility**: Settings preserved in node.data

## Copy/Paste Implementation

### Data Serialization

When copying nodes and edges, the editor serializes them into a clipboard format:

```typescript
const serializeSelection = (): ClipboardData | null => {
  const selectedNodes = nodes.filter(node => node.selected)
  const selectedEdges = edges.filter(edge => edge.selected)
  
  const clipboardNodes: ClipboardNodeData[] = selectedNodes.map(node => {
    const nodeType = getNodeType(node.id)
    
    switch(nodeType) {
      case "input": {
        const portName = node.id.slice("$input:".length)
        const nodeData = node.data as { port?: { values?: { type: string }[] } }
        const values = nodeData?.port?.values || [{ type: "any" }]
        
        return {
          name: node.id,
          type: 'input',
          nodeType: 'input',
          properties: {},
          position: node.position,
          portData: {
            portName: portName,
            values: values
          }
        }
      }
      
      case "output": {
        const portName = node.id.slice("$output:".length)
        const nodeData = node.data as { port?: { values?: { type: string }[] } }
        const values = nodeData?.port?.values || [{ type: "any" }]
        
        return {
          name: node.id,
          type: 'output', 
          nodeType: 'output',
          properties: {},
          position: node.position,
          portData: {
            portName: portName,
            values: values
          }
        }
      }
      
      case "node": {
        // Engine node serialization
        const nodeData = node.data && typeof node.data === 'object' && 'nodeData' in node.data 
          ? (node.data as NodeDataStructure).nodeData 
          : null
          
        return {
          name: node.id,
          type: nodeData?.type || node.type || 'default',
          nodeType: 'node',
          properties: nodeData?.properties || {},
          position: node.position,
          inputs: nodeData?.inputs
        }
      }
      
      case "editor": {
        // Editor node serialization with settings preservation
        const nodeData = node.data || {}
        const editorSpecificData = Object.keys(nodeData).reduce((acc, key) => {
          if (key !== 'editorModelUpdater' && key !== 'graphEndpoint' && key !== 'label') {
            const value = nodeData[key]
            if (value === null || value === undefined ||
                typeof value === 'string' || typeof value === 'number' || 
                typeof value === 'boolean' || 
                (typeof value === 'object' && value !== null && !value.hasOwnProperty('current') && 
                 typeof value !== 'function')) {
              acc[key] = value
            }
          }
          return acc
        }, {} as Record<string, unknown>)
        
        return {
          name: node.id,
          type: node.type || 'default',
          nodeType: 'editor',
          properties: {},
          position: node.position,
          editorData: {
            width: node.width || node.measured?.width,
            height: node.height || node.measured?.height,
            data: editorSpecificData
          }
        }
      }
    }
  })
  
  const clipboardEdges: ClipboardEdgeData[] = selectedEdges
    .filter(edge => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target))
    .map(edge => ({
      source: `${edge.source}.${edge.sourceHandle}`,
      target: `${edge.target}.${edge.targetHandle}`,
      sourceNodeType: getNodeType(edge.source),
      targetNodeType: getNodeType(edge.target)
    }))
  
  return {
    nodes: clipboardNodes,
    edges: clipboardEdges
  }
}
```

### Paste Implementation

When pasting, the editor must:

1. **Create nodes via appropriate APIs**
2. **Map old names to new names**
3. **Create edges with correct format conversion**
4. **Update React Flow state consistently**

```typescript
const handlePaste = async () => {
  const clipboardData: ClipboardData = JSON.parse(await navigator.clipboard.readText())
  
  // Step 1: Create nodes and build name mapping
  const nameMapping = new Map<string, string>()
  const createdNodes: CreatedNodeResponse[] = []
  
  for (const nodeData of clipboardData.nodes) {
    let newNodeId: string
    
    switch(nodeData.nodeType) {
      case 'input': {
        const originalPortName = nodeData.portData?.portName || 'input'
        const newPortName = `${originalPortName}_${generateUniqueId()}`
        newNodeId = `$input:${newPortName}`
        
        await fetch(`http://${engineGatewayUrl}/node-flow/graphs/${graphName}/inputs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newPortName,
            values: nodeData.portData?.values || [{ type: 'any' }]
          })
        })
        break
      }
      
      case 'output': {
        const originalPortName = nodeData.portData?.portName || 'output'
        const newPortName = `${originalPortName}_${generateUniqueId()}`
        newNodeId = `$output:${newPortName}`
        
        await fetch(`http://${engineGatewayUrl}/node-flow/graphs/${graphName}/outputs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newPortName,
            values: nodeData.portData?.values || [{ type: 'any' }]
          })
        })
        break
      }
      
      case 'node': {
        const response = await fetch(`http://${engineGatewayUrl}/node-flow/graphs/${graphName}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: nodeData.type,
            properties: nodeData.properties
          })
        })
        const createdNode = await response.json()
        newNodeId = createdNode.name
        break
      }
      
      case 'editor': {
        newNodeId = `$editor:${generateUniqueId()}`
        editorModelUpdater.addEditorNode(newNodeId, nodeData.type, newX, newY)
        if (nodeData.editorData?.data) {
          editorModelUpdater.patchNodeData(newNodeId, nodeData.editorData.data)
        }
        break
      }
    }
    
    nameMapping.set(nodeData.name, newNodeId)
    createdNodes.push({ name: newNodeId, type: nodeData.type, properties: nodeData.properties })
  }
  
  // Step 2: Create edges with proper format conversion
  const createdEdgeResults = []
  
  for (const edgeData of clipboardData.edges) {
    const sourceParsed = parseEdgeEndpoint(edgeData.source)
    const targetParsed = parseEdgeEndpoint(edgeData.target)
    
    const newSourceName = nameMapping.get(sourceParsed.nodeName)!
    const newTargetName = nameMapping.get(targetParsed.nodeName)!
    
    // Convert to Engine API format
    let engineSource: string
    let engineTarget: string
    
    if (edgeData.sourceNodeType === 'input') {
      engineSource = `.${newSourceName.slice("$input:".length)}`
    } else {
      engineSource = `${newSourceName}.${sourceParsed.portHandle}`
    }
    
    if (edgeData.targetNodeType === 'output') {
      engineTarget = `.${newTargetName.slice("$output:".length)}`
    } else {
      engineTarget = `${newTargetName}.${targetParsed.portHandle}`
    }
    
    // Create edge via Engine API
    const edgeResponse = await fetch(`http://${engineGatewayUrl}/node-flow/graphs/${graphName}/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: engineSource,
        target: engineTarget
      })
    })
    
    if (edgeResponse.ok) {
      createdEdgeResults.push({
        edgeData,
        newSourceName,
        newTargetName,
        sourceNodeType: edgeData.sourceNodeType,
        targetNodeType: edgeData.targetNodeType,
        success: true,
        edgeId: `${engineSource}-${engineTarget}`
      })
    }
  }
  
  // Step 3: Update React Flow state
  const newNodeObjects = createReactFlowNodes(createdNodes, nameMapping)
  const newEdgeObjects = createReactFlowEdges(createdEdgeResults)
  
  setNodes(prevNodes => [...prevNodes.map(n => ({ ...n, selected: false })), ...newNodeObjects])
  setEdges(prevEdges => [...prevEdges, ...newEdgeObjects])
}
```

## Error Handling

### Common Issues

1. **Port name conflicts**: Use unique ID generation
2. **Type mismatches**: Validate port compatibility
3. **Missing nodes**: Verify node existence before edge creation
4. **API failures**: Implement retry logic and user feedback

### Debugging

1. **Enable console logging**: Track ID transformations
2. **Validate state consistency**: Compare React Flow vs Engine state
3. **Monitor network requests**: Verify API request/response formats
4. **Type checking**: Ensure TypeScript alignment with runtime data

## Performance Considerations

### Batch Operations

- **Node creation**: Process nodes in parallel where possible
- **Edge creation**: Create edges after all nodes exist
- **State updates**: Batch React Flow state updates

### Memory Management

- **Clipboard data**: Clear large objects after use
- **Event listeners**: Remove callbacks on component unmount
- **State synchronization**: Avoid unnecessary re-renders

This integration guide provides the foundation for maintaining consistency between the editor interface and the engine backend while handling the complexities of different ID and data formats.