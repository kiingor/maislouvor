// Procurar um nome só no código de uma migração (fora dos comentários), em qualquer forma:
// CREATE/ALTER/DROP FUNCTION, GRANT/REVOKE em lista, com ou sem schema, entre aspas.
// Comentários: "-- ..." até o fim da linha e "/* ... */" (as linhas continuam com o mesmo número).
// Um "--" dentro de uma string encerra a linha mais cedo: aceitável para uma trava de teste.

/** O SQL com os comentários trocados por espaços (mesmas linhas). */
export const sqlWithoutComments = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/--[^\n]*/g, '');

/**
 * Linhas de código que citam o nome como palavra inteira (platform_<nome> não conta).
 * Devolve [{ line, text }] para a mensagem do teste apontar onde está.
 */
export function sqlCodeMentions(sql, name) {
  const word = new RegExp(`(?<![A-Za-z0-9_$])${name}(?![A-Za-z0-9_$])`, 'i');
  return sqlWithoutComments(sql).split('\n')
    .map((text, index) => ({ line: index + 1, text: text.trim() }))
    .filter(({ text }) => word.test(text));
}
