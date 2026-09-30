import test from "node:test";
import assert from "node:assert/strict";
import { getEditableArticle } from "../src/components/editArticleData.js";
import { queryArticlesWithCondition } from "../src/supabase/articleQuery.js";

test("editor uses stored title and description when legacy fields are empty", () => {
  const form = getEditableArticle({ titulo: "", title: "Guitarra", descripcion: "", description: "Buen estado", estado_producto: 7 });
  assert.equal(form.titulo, "Guitarra");
  assert.equal(form.descripcion, "Buen estado");
  assert.equal(form.estado_producto, 7);
  assert.equal(getEditableArticle({ titulo: "Mesa", descripcion: "Madera" }).titulo, "Mesa");
});

test("article condition query preserves readable listings before migration", async () => {
  const calls = [];
  const run = async columns => {
    calls.push(columns);
    return columns.includes("estado_producto")
      ? { error: { message: "column articulos.estado_producto does not exist" } }
      : { data: [{ id: "article-1" }], error: null };
  };
  assert.equal((await queryArticlesWithCondition("id,title", run)).data[0].id, "article-1");
  await queryArticlesWithCondition("id,title", run);
  assert.deepEqual(calls, ["estado_producto,id,title", "id,title", "id,title"]);
});
