# API Trigger Specification (Phase 3)

**Endpoint:** `POST /api/process-broll`
**Auth:** None (currently open) or via Apple Shortcut logic.

## Canonical API Contract
The client **MUST** provide `city` and `country` as non-empty strings.

**Headers:**
`Content-Type: application/json`

**Body Schema:**
```json
{
  "country": "string (required, non-empty)",
  "city": "string (required, non-empty)",
  "dry_run": false,
  "max_items": 5
}
```

## Rules (NON-NEGOTIABLE)

### `country`
* MUST exist in the JSON body
* MUST be of type string
* MUST NOT be an empty string (whitespace is not sufficient)

### `city`
* MUST exist in the JSON body
* MUST be of type string
* MUST NOT be an empty string (whitespace is not sufficient)

### Explicitly Forbidden
* ❌ Default values for `country` or `city`
* ❌ Inferring `country` from folder names at the API level
* ❌ Inferring `city` from Gemini or filenames at the API level
* ❌ Normalizing values at the API layer
* ❌ Passing `undefined`, `null`, or `""` downstream

## Behavior

### Validation:
If either `country` or `city` fails validation:
1.  The request terminates immediately inside the route handler.
2.  The request returns **HTTP 400 Bad Request**.
3.  The request does **NOT** call or import any downstream logic (`main.ts`, etc.).

### Execution:
Only upon successful validation:
1.  Spawns background worker (`src/broll/main.ts`).
2.  Passes `city` as Command Line Argument 1.

### Response:

**Success (200):**
```json
{ 
  "success": true, 
  "message": "...", 
  "status": "processing" 
}
```

**Failure (400):**
```json
{ 
  "success": false, 
  "error": "Missing or invalid required fields: country, city" 
}
```