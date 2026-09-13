import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  /**
   * O SEQUELIZE NÃO PODE SER EMPACOTADO: tem que existir UMA cópia só.
   *
   * Empacotado, cada rota do `next dev` leva a sua cópia, mas a conexão (`db`,
   * em lib/db.ts) é uma só, guardada em `globalThis`. O Sequelize reconhece as
   * próprias peças por `instanceof` -- os Models, e as expressões `fn`/`col`/
   * `cast` --, e peça de uma cópia não é reconhecida pela outra. Sintoma medido
   * em 12/09/2026: `attr[0].includes is not a function` num `cast`, e `order`
   * por atributo virando `"MemberDirectory"."admissionDate"`, coluna que não
   * existe. O `typecheck` e o `build` não veem nada disso.
   *
   * Fora do bundle, quem carrega é o `require` do Node, que tem um cache só. É
   * o mesmo tratamento que o Next já dá por padrão ao `pg`.
   */
  serverExternalPackages: ["sequelize"],
  experimental: {
    /**
     * O LIMITE DE CORPO EXISTE PORQUE ESTE PROJETO TEM `proxy.ts`, e o padrão
     * dele (10 MB) era menor do que o teto que a gente prometeu.
     *
     * Achado rodando, não lendo: enviar uma imagem de 17 MiB não chegava ao
     * teto de 16 MiB da rota de mídia -- o Next truncava o corpo antes, o
     * `formData()` estourava, e a igreja recebia "o envio chegou incompleto" em
     * vez de "o limite é 16 MB". O aviso só aparece no log do servidor, e nada
     * na resposta apontava para cá.
     *
     * 20 MB e não 16: o multipart carrega envelope (fronteiras, cabeçalhos de
     * parte, nome do arquivo) por cima dos bytes, então um arquivo exatamente
     * no teto chega um pouco maior que o teto. Quem manda na recusa continua
     * sendo `TETO_MIDIA_BYTES`, na rota, que sabe o tamanho do ARQUIVO -- este
     * número só existe para a recusa ser dela, com mensagem que se entende, e
     * não do framework.
     *
     * `proxyClientMaxBodySize` e não `middlewareClientMaxBodySize`: o segundo é
     * o nome antigo e está marcado como deprecated nos tipos do Next.
     */
    proxyClientMaxBodySize: 20 * 1024 * 1024,
  },
};

export default nextConfig;
