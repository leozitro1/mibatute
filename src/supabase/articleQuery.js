let conditionColumnAvailable = true;

// Keep older schemas readable until the condition migration is applied.
export async function queryArticlesWithCondition(columns, run) {
  let result = await run(conditionColumnAvailable ? `estado_producto,${columns}` : columns);
  if (conditionColumnAvailable && result.error && /estado_producto/.test(result.error.message || "")) {
    conditionColumnAvailable = false;
    result = await run(columns);
  }
  return result;
}
