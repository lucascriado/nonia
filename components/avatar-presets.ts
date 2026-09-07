/**
 * Avatares prontos, como PNG em data URI.
 *
 * GERADOS UMA VEZ E FIXOS NO CÓDIGO, de propósito. Se fossem desenhados no
 * navegador, o PNG sairia com bytes diferentes em cada motor, e a comparação
 * que marca "este é o seu" deixaria de casar para quem escolhesse num
 * navegador e olhasse noutro.
 *
 * PNG porque é o que o servidor aceita: `validatePhoto` em lib/records.ts só
 * deixa passar data URI de PNG ou JPG. SVG seria menor, e foi tentado antes --
 * o servidor recusou com "A foto deve ser PNG ou JPG".
 *
 * Cada um pesa cerca de 326 bytes, contra um teto de campo de
 * 120 KB e uma foto de verdade que chega perto dele.
 *
 * As cores são os tons escuros da paleta -- sage, oliva, areia e neutro quente
 * -- com a forma clara por cima. Elas NÃO acompanham o tema, e é deliberado:
 * imagem guardada não muda com o tema, e um disco opaco se lê nos dois.
 *
 * Para mudar os desenhos, edite e rode o gerador em
 * scripts/gerar-avatares.mjs; não edite estas strings à mão.
 */
export const AVATAR_PRESETS = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAxElEQVR42u3WvQ3DIBCGYfbIMClYgAlCzQq0DELNCKbwBO6gtZA7KkveIAVSmsSRzxHJSfmkd4BHOn5OXG5XVgmAAAIIIIAAAgig/ZQzPoZc0rrVdau5JB+DcuYHIGn1MI3N8dwwjdLq74Gk1Uud9zStpc7nTKKH5hMTGfRmUi9n1xeknDmuaVHPOA3kY6CCfAwdQY8bfrxcUkcQVdP6JxC7kbE71OyuPbuHkePXwe5z5bh+cFzQsFMDBBBAAAEEEEBnuwNXlYLxQET6IAAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAABIUlEQVR42u3XoQ6DMBAG4D7a9Hwz2Vmq8bVNXZG8ARKFwyFIBQZd1aRTS/YGE0uWyxJIC2y5JZecbMlH76e07Hw5oSpGIAIRiEAEItCvQELyqjaD60P098ft/riF6AfXV7URkv8UJCRvu+aFWKq2a7axskHaqveSrFeIXlv1XZC2KoUCK9fE9mimedRWvVsjJNdWTfO4x8TScwM7FaKvarM0uKrNx+D0PKWCYIpD9EV5XR9flFdoarvmSJCQHLZgZW0+1gnOSlwklvvoaR7TAwHzlPgaSaDB9dsSCr+DwfWHgWAasrY72OsQ/WEgGIXcjS537n+C0LUMXajRffboNkZ0vw6MP1d0xw+MBzSMR1iMh3yM1yC6uRKIQAQiEIEw1RM1pMTM0+RZhgAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAs0lEQVR42u3XsQmAMBAFUMeydwpbW0cQG8FeR7AVLCzcQBAcQGxS56pANrA4sDZC5Asf/gCPuyR3SaoihUpCEEEEEUQQQQRpnBcrZl/naWibMoMA3bFilrF7x4oC0pzH1tc5EEhLFWqKC9I6BfUuOsh5WcYOC2TFPC/SFyDnZRpaLNC+zlggKwYL5LwQ9K+WwR1qrGsP9zBijQ6s4Yq1fgAtaCgrLNaSz38ZQQQRRBBBBGkuC5MAaKlzlFgAAAAASUVORK5CYII=",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAARklEQVR42u3WoQ0AIAwAwU6KwnRzFAkbYNHFkHDJD3Dyo2d7qgACAgICAgICOpprFAICAgICAgICAvoH5KmBgICAgICArttjAY0lWkZx8wAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAA80lEQVR42u3WIQqEQBTG8XePvYAXMG+wmQzmNYoms8Ei3kCz1T2CBk9g0ypimyR4gw0DsrD4lpmRnYF98B3gxwt/Htwed6MGBCIQgQhEIAIRyESQl0deHhkEmpZxWkZTQHGVbTvbdhZXmX6QFbormzloZbMVuppBRVNyDV/RlDpBduIf5zmOZCe+NlDdPd81fHX31ANy0uBTw+ekgQZQO/RnoHbofw3y8uhMwyfdSZAuIQ6S7iSolBCfXCdBpYT45DoJiiXEJ9FJUCzh1yOJdhLUS4hPtJNwSQnxCXUSLikhPqFO0k9NIAIRiEAEIhCB/h30Ahlp7Aga/yF6AAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAlklEQVR42u3XwQ3AIAwDQI/WdxfojHnyYiVeSGzQGQCnuJKlDHBSIHFwP5dUwSCDDDLIIINOgEqNUkMFVGr00fpoFBNYGpYJRA3FBK5m3wS6ZtOEDM2OCUmaZRPyNGsmpGoWTMjWzJrwgWbK9E+QXMsUH7Xit1ccjIqrQ3G5KsYPxYCmGGEVQ77iGeTL1SCDDDLIoKP1Aq8tF8ew1ZBiAAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAASklEQVR42u3UQQ0AIAwEwcpCDzZqmBcJDhBBHySdZAXM5y5yjq8KICAgICAgICAgoHfQPqskoL4gKwOyMiA/BAQEBAQEBATUB3QBobQDJgYybQYAAAAASUVORK5CYII=",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAm0lEQVR42u3VrQqAMBSG4V2pSRCDxbS0sktZWthtmAa7DZPgHRiEBUWYuHBwL5z4wXlgP5/qx07UKECAAAECBKg1kLHaB+eDM1Z/yVQATfMQ07Lta56Ylmke3maqgS6b8r63mTogY/V90zn5XEoy1UA+uKdlPrjyzH9B4o5M3KWW+OzFfYx0GV1Gl9FldBldRpcBAgQIECBALYAOiMMeZRoytW0AAAAASUVORK5CYII=",
];
