# nonoha-engine Editor Documentation

This directory contains technical documentation for the nonoha-engine editor, focusing on the integration between the React Flow-based frontend and the Engine API backend.

## Documentation Overview

### [ID Specifications](./id-specifications.md)
**Complete reference for node and edge ID formats**
- Editor side (React Flow) vs Engine side (API) ID conventions
- Node type identification patterns
- Edge ID generation rules
- Port specifications and validation
- Copy/paste data structures

### [API Integration Guide](./api-integration.md)
**Detailed implementation examples for Engine API integration**
- Node management operations (create, read, update, delete)
- Edge management with format conversion
- Data fetching and transformation
- Complete copy/paste implementation
- Error handling and performance optimization

### [Troubleshooting Guide](./troubleshooting.md)
**Solutions for common issues and debugging techniques**
- Copy/paste edge visibility problems
- Node ID and edge key mismatches
- API integration failures
- State synchronization issues
- Development tools and debugging workflows

## Quick Reference

### Node ID Patterns

| Type | React Flow | Engine API | Example |
|------|------------|------------|---------|
| Engine Node | `nodeName` | `nodeName` | `"nodeA"` |
| Input Port | `$input:portName` | `portName` | `"$input:input1"` vs `"input1"` |
| Output Port | `$output:portName` | `portName` | `"$output:output1"` vs `"output1"` |
| Editor Node | `$editor:id` | N/A | `"$editor:comment_123"` |

### Edge Format Conversion

| Connection | React Flow | Engine API |
|------------|------------|------------|
| Input → Node | `source: "$input:name"` | `source: ".name"` |
| Node → Output | `target: "$output:name"` | `target: ".name"` |
| Node → Node | `source: "nodeA"` | `source: "nodeA.portName"` |

### Critical Functions

- **`getNodeType(id: string)`** - Determines node type from ID
- **`parseEdgeEndpoint(endpoint: string)`** - Parses clipboard edge format
- **`fetchGraphEdges()`** - Converts Engine API to React Flow format
- **`serializeSelection()`** - Copy operation implementation
- **`handlePaste()`** - Paste operation implementation

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐
│   React Flow    │────▶│   Engine API    │
│   (Frontend)    │     │   (Backend)     │
├─────────────────┤     ├─────────────────┤
│ Node IDs:       │     │ Node Names:     │
│ $input:name     │     │ name            │
│ $output:name    │     │ name            │
│ $editor:name    │     │ N/A             │
│ nodeName        │     │ nodeName        │
├─────────────────┤     ├─────────────────┤
│ Edge Format:    │     │ Edge Format:    │
│ source: nodeId  │     │ source: node.port│
│ target: nodeId  │     │ target: node.port│
│ handles: port   │     │ (embedded)      │
└─────────────────┘     └─────────────────┘
        │                       │
        └──── State Sync ──────┘
```

## Common Issues

### Edge Not Appearing After Paste

- **Cause**: ID mismatch between React Flow and Engine API
- **Solution**: Verify node ID mapping and handle ID rules
- **Reference**: [Troubleshooting Guide - Copy/Paste Issues](./troubleshooting.md#copypaste-issues)

### Port Names Not Matching

- **Cause**: Using original names instead of actual created names
- **Solution**: Extract actual port names from created node IDs
- **Reference**: [API Integration - Port Operations](./api-integration.md#graph-port-operations)

### Editor Node Settings Lost

- **Cause**: Data not passed via props.data at construction
- **Solution**: All settings loaded in page.tsx and spread into node.data
- **Reference**: [API Integration - Editor Node Data Loading](./api-integration.md#editor-node-data-loading)

## Development Workflow

1. **Read [ID Specifications](./id-specifications.md)** - Understand the ID system
2. **Study [API Integration](./api-integration.md)** - Learn implementation patterns
3. **Use [Troubleshooting Guide](./troubleshooting.md)** - Debug issues
4. **Update Documentation** - Keep docs current with code changes

## Contributing

When making changes to the ID system or API integration:

1. **Update specifications** in relevant documentation files
2. **Add examples** to API integration guide
3. **Document troubleshooting steps** for new issues
4. **Test edge cases** and update validation rules
5. **Verify backward compatibility** or add migration notes

## Related Files

### Core Implementation
- `app/graphs/page.tsx` - Main graph editor with copy/paste logic
- `src/stores/node-flow-store.tsx` - Node/edge fetching and conversion
- `src/components/basic-node-edge.tsx` - Edge visualization
- `src/nodes/*/` - Node implementations

### Type Definitions
- `BasicEdge` interface in `node-flow-store.tsx`
- `ClipboardData` interfaces in `page.tsx`
- Node-specific type definitions in individual node files

This documentation provides the foundation for understanding and maintaining the complex interactions between the editor frontend and engine backend while ensuring consistency and reliability of the node/edge management system.