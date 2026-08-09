/** Emit dist/*.css for consumers who prefer a real stylesheet over runtime injection. */
import { CORE_CSS } from "../packages/scrollsheet/src/internal/styles";
import { TOAST_CSS } from "../packages/scrollsheet/src/toast/toast-styles";

await Bun.write(new URL("../packages/scrollsheet/dist/styles.css", import.meta.url), CORE_CSS.trimStart());
console.log("dist/styles.css written");

await Bun.write(new URL("../packages/scrollsheet/dist/toast.css", import.meta.url), TOAST_CSS.trimStart());
console.log("dist/toast.css written");
