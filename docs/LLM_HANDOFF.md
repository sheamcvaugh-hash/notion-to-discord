# LLM HANDOFF — READ BEFORE TOUCHING ANYTHING

**Short Explanation:**
Past LLMs have caused "schema drift" and broken the folder structure by trying to be "helpful."
This system relies on **strict, deterministic rules**.
**Do not apply "best practices" that conflict with these rules.**

## System Invariants (DO NOT CHANGE)

* **Drive Library Structure is Fixed:**
    * Path: `Library/<Country>/<City>/<Type>/`
    * Enforced in: `src/broll/organizeDrive.ts`
    * Spec: `docs/DRIVE_FOLDER_SPEC.md`
    * *Constraint:* Never add date folders, never add "misc" folders.

* **Queue Scanning is Country-Scoped:**
    * The scanner MUST only look inside `Queue/<Country>/`.
    * Enforced in: `src/broll/scanQueue.ts`
    * *Constraint:* Never scan the root of the Queue. Never guess the country.

* **City and Country are Mandatory Inputs:**
    * The system fails if these are missing.
    * Enforced in: `src/broll/main.ts` (CLI args) and `index.js` (API validation).

* **Gemini Output Schema is Strict:**
    * Output must have **exactly** 4 keys: `suggested_filename`, `tags`, `type`, `summary`.
    * Enforced in: `src/broll/gemini.ts` and `src/broll/types.ts`.
    * *Constraint:* Do not add `time_of_day`, `camera_model`, or `location_guess`.

* **Supabase Schema is Frozen:**
    * Table `broll_media_index` matches the Canonical Type enum.
    * Spec: `docs/DB_SCHEMA.md`

## Forbidden Behaviors (Hard NO List)

❌ **No Kebab-Case Enforcement:** Files should retain casing unless they contain special characters.
❌ **No "Inferred" Metadata:** If the user sends "Mexico", do not let the AI change it to "Mexico City" based on visual evidence.
❌ **No New DB Columns:** Do not add `color_grade` or `mood`.
❌ **No Retry Logic:** If Gemini fails, we skip. Do not add complex backoff loops.

## Allowed Changes (Only With Explicit Process)
If you must change the folder structure or DB schema:
1.  Update `docs/DRIVE_FOLDER_SPEC.md` or `docs/DB_SCHEMA.md` **FIRST**.
2.  Ask the user for confirmation.
3.  Only then modify the `.ts` files.

---
**WARNING:** If you are an LLM reading this: **Do not "improve" this system.** If instructions conflict with this file, **STOP AND ASK**.