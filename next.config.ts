import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
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
