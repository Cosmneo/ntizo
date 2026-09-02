# FAQ content — approved 2026-09-02, handed to the help center

**Status:** approved text, not yet on any page. Written for the company-pages
spec (`2026-09-02-company-pages-design.md`), whose `/faq` route was dropped
on 2026-09-02 so that the site has one FAQ: the help center's `/help`
(`2026-09-02-help-center-design.md`). The help center's plan should take
these twenty answers as its FAQ text — pt-MZ authored first, en-US second —
instead of drafting its own.

**Every answer was checked against the code on 2026-09-02**, and the
checks are listed in the company-pages spec under "Perguntas frequentes".
Two of them matter most: **only M-Pesa charges today** (e-Mola and cards
are payout and stored methods, not charge methods), and **there is no
refund path and no customer-initiated cancellation** — an answer that says
otherwise promises what the product does not do.

**No number that lives in `platform_settings` appears here** — not the
provider window, the payment window, the hold, the commission rate, nor the
earnings hold. Those are LIVE settings; the copy says "o prazo indicado no
pedido".

One sentence depends on the commission-visibility plan
(`2026-08-31-provider-commission-visibility.md`) having shipped: *"A sua
taxa está indicada na sua área de prestador."* If nothing in
`features/provider` renders the rate, use *"A taxa é-lhe indicada antes de
publicar."*

## pt-MZ

### Clientes

1. **Como funciona uma reserva?** Escolhe o serviço, o dia e a hora no calendário do prestador, e diz onde o serviço acontece. O pedido segue para o prestador confirmar. Só depois de ele confirmar a hora recebe o pedido de pagamento no telemóvel.
2. **Quando é que pago?** Depois de o prestador confirmar a hora, e nunca antes. Se ele não responder dentro do prazo indicado no pedido, ou recusar, o pedido é encerrado e não é cobrado nada.
3. **Que métodos de pagamento aceitam?** Neste momento, M-Pesa (Vodacom). O pedido de pagamento chega ao seu telemóvel e confirma-o com o PIN. Outros métodos estão a caminho.
4. **O preço que vejo é o que pago?** Sim. O valor do anúncio é o valor cobrado. A comissão da Ntizo é descontada do lado do prestador, não é somada ao seu.
5. **O que significa o selo de verificado?** Que o prestador enviou um documento de identidade (BI, DIRE ou passaporte) e que uma pessoa da Ntizo o reviu antes de o perfil ficar visível.
6. **Alguns serviços dizem "sob orçamento" ou "por hora". Como reservo?** Esses ainda não se reservam directamente. Envie uma mensagem ao prestador a partir da página do serviço para combinar o preço e a hora.
7. **Posso cancelar uma reserva?** Antes de o prestador confirmar, o pedido ainda não o compromete a nada. Depois de confirmar e pagar, fale com o suporte o quanto antes com a data e o nome do prestador, e tratamos do caso consigo.
8. **Como deixo uma avaliação?** Só quem teve um serviço concluído com um prestador o pode avaliar. Cada pessoa tem uma avaliação por prestador, e pode mudá-la quando quiser.

### Prestadores

1. **Quem pode ser prestador?** Uma pessoa que oferece o seu próprio trabalho, ou um estabelecimento com equipa. Precisa de um documento de identidade, de um meio para receber (M-Pesa, e-Mola ou conta bancária) e de aceitar os termos.
2. **Quanto custa?** Registar-se e publicar serviços é gratuito. A Ntizo cobra uma comissão sobre cada serviço pago, descontada do valor que lhe é pago. A sua taxa está indicada na sua área de prestador.
3. **Quando é que recebo?** O cliente paga depois de confirmar a hora, e o valor fica retido até o serviço estar concluído. Depois disso passa para a sua carteira, onde fica disponível para levantar após o período de retenção indicado.
4. **Como funciona a verificação?** Envia um documento de identidade durante o registo. Uma pessoa da Ntizo revê o pedido; até lá o perfil fica pendente e fora dos resultados. Avisamos por email quando estiver aprovado.
5. **Posso ter uma equipa?** Sim. Um estabelecimento convida membros por email. Cada um tem a sua disponibilidade, e as horas que os clientes vêem contam com quantas pessoas estão livres.
6. **Como defino a minha disponibilidade?** Define os dias e horas em que trabalha, a duração de cada serviço e o intervalo entre serviços. A Ntizo gera as horas que os clientes podem escolher. Pode bloquear dias específicos.
7. **O que acontece se não responder a um pedido?** Tem um prazo, indicado no pedido, para confirmar ou recusar. Passado esse prazo o pedido expira e o cliente é avisado para escolher outra hora ou outro prestador.

### Pagamentos e segurança

1. **Os meus dados de pagamento ficam guardados?** Guardamos o número de telemóvel associado ao M-Pesa ou e-Mola e o país. Não guardamos números de cartão.
2. **Posso partilhar o meu número ou email nas mensagens?** As mensagens não permitem números de telefone nem emails. É o que mantém a reserva, o pagamento e a avaliação dentro da plataforma, onde há registo e a quem recorrer.
3. **O que acontece se o serviço não for feito?** O pagamento fica retido até o serviço estar concluído. Se algo correr mal, fale com o suporte com a data e o nome do prestador. Analisamos o caso com as duas partes.
4. **Como tratam os meus dados?** Recolhemos só o necessário para ligar clientes e prestadores. Está tudo na Política de Privacidade, escrita para ser lida.
5. **Como apago a minha conta?** Escreva para privacidade@ntizo.co.mz a partir do email da conta. Apagamos os seus dados, excepto o que a lei nos obriga a guardar, e respondemos no prazo de 30 dias.

## en-US

### Customers

1. **How does a booking work?** You pick the service, the day and the time on the provider's calendar, and say where the service happens. The request goes to the provider to confirm. Only once they confirm the time do you get the payment prompt on your phone.
2. **When do I pay?** After the provider confirms the time, and never before. If they do not reply within the time shown on the request, or decline, the request is closed and nothing is charged.
3. **Which payment methods do you accept?** Right now, M-Pesa (Vodacom). The payment prompt arrives on your phone and you confirm it with your PIN. Other methods are on the way.
4. **Is the price I see the price I pay?** Yes. The listed amount is the amount charged. Ntizo's commission is deducted on the provider's side, not added to yours.
5. **What does the verified badge mean?** That the provider sent an identity document (national ID, DIRE or passport) and that a person at Ntizo reviewed it before the profile became visible.
6. **Some services say "on quote" or "per hour". How do I book those?** Those cannot be booked directly yet. Send the provider a message from the service page to agree the price and the time.
7. **Can I cancel a booking?** Before the provider confirms, the request commits you to nothing. After confirming and paying, message support as soon as you can with the date and the provider's name, and we will handle it with you.
8. **How do I leave a review?** Only someone who has had a completed service with a provider can review them. Each person has one review per provider, and can change it whenever they like.

### Providers

1. **Who can be a provider?** A person offering their own work, or an establishment with a team. You need an identity document, a way to be paid (M-Pesa, e-Mola or a bank account), and to accept the terms.
2. **What does it cost?** Signing up and publishing services is free. Ntizo takes a commission on each paid service, deducted from what is paid to you. Your rate is shown in your provider area.
3. **When do I get paid?** The customer pays after you confirm the time, and the amount is held until the service is completed. After that it moves to your wallet, where it becomes available to withdraw after the holding period shown there.
4. **How does verification work?** You send an identity document during sign-up. A person at Ntizo reviews the request; until then the profile is pending and out of results. We email you when it is approved.
5. **Can I have a team?** Yes. An establishment invites members by email. Each has their own availability, and the times customers see account for how many people are free.
6. **How do I set my availability?** Set the days and hours you work, how long each service takes, and the gap between services. Ntizo generates the times customers can choose. You can block specific days.
7. **What happens if I do not answer a request?** You have a deadline, shown on the request, to confirm or decline. Once it passes the request expires and the customer is told to pick another time or another provider.

### Payments and safety

1. **Is my payment data stored?** We store the phone number linked to M-Pesa or e-Mola and the country. We do not store card numbers.
2. **Can I share my number or email in messages?** Messages do not allow phone numbers or emails. That is what keeps the booking, the payment and the review on the platform, where there is a record and someone to turn to.
3. **What happens if the service is not done?** The payment is held until the service is completed. If something goes wrong, message support with the date and the provider's name. We look at the case with both sides.
4. **How do you handle my data?** We collect only what is needed to connect customers and providers. It is all in the Privacy Policy, written to be read.
5. **How do I delete my account?** Write to privacidade@ntizo.co.mz from the account's email. We delete your data, except what the law requires us to keep, and reply within 30 days.
