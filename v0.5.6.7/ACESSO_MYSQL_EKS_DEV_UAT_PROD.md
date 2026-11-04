# Monitor Portal — Acesso ao MySQL no EKS (DEV / UAT / PROD)

**Compatível com v0.5.6.4 e posterior.** Guia de acesso ao MySQL *existente* (`rabbitmq-monitor-mysql`) sem substituição do StatefulSet, troca de imagem, alteração de `PVC`, exclusão de bancos ou alteração do Service `ClusterIP` que já atende a aplicação.

## 0. Como escolher

| Método | Necessita alterar Kubernetes? | Endereço do cliente | Melhor utilização |
| --- | --- | --- | --- |
| `kubectl port-forward` | Não | `127.0.0.1:3307` | Diagnóstico e migração DEV, imediatamente |
| `kubectl exec` | Não | Terminal no próprio pod | Consultas pontuais sem abrir porta |
| `Service NodePort` adicional | Sim, somente novo Service | `IP_PRIVADO_NODE:31306` | Teste rápido, nó e porta acessíveis na rede corporativa |
| `Service LoadBalancer` com NLB interno | Sim, somente novo Service + LB AWS | `DNS_INTERNO_NLB:3306` | Acesso persistente por DNS corporativo |
| Bastion / SSH / SSM / túnel | Depende do salto | `127.0.0.1:<porta>` | Usuários que não têm `kubectl` ou acesso direto ao VPC |
| Ingress TCP específico (NGINX/HAProxy/Envoy) | Sim, somente se controlador suporta TCP | DNS e porta TCP do controlador | Reaproveitar controlador L4 já habilitado; mais complexo |

**ALB HTTP/HTTPS atual não serve para MySQL:** um AWS Application Load Balancer não oferece listener genérico de TCP/3306. DNS não converte HTTP em MySQL. Para o banco, é necessário NLB (camada 4) ou outro proxy TCP; não adianta acrescentar regra por hostname ao Ingress do ALB.

**Endpoint DNS do EKS:** o DNS do *control plane* EKS é para a API Kubernetes; não é um endpoint genérico para os Services. `rabbitmq-monitor-mysql.<namespace>.svc.cluster.local` normalmente funciona apenas dentro do cluster (ou com DNS e roteamento específicos para a rede Kubernetes), não automaticamente no desktop.

## 1. Descobrir contexto, namespace, Service, Pods e estado

### PowerShell

```powershell
kubectl config get-contexts
kubectl config current-context
kubectl get namespaces
kubectl get svc -A | Select-String 'rabbitmq-monitor-mysql'
kubectl get sts -A | Select-String 'rabbitmq-monitor-mysql'

$NS = '<NAMESPACE_DEV>'
kubectl -n $NS get svc rabbitmq-monitor-mysql -o wide
kubectl -n $NS get sts rabbitmq-monitor-mysql -o wide
kubectl -n $NS get pods -l app=rabbitmq-monitor-mysql -o wide
kubectl -n $NS get endpointslice -l kubernetes.io/service-name=rabbitmq-monitor-mysql
kubectl auth can-i create pods/portforward -n $NS
```

Para descobrir o cluster/região por AWS CLI, se necessário:

```powershell
aws configure list
aws eks list-clusters --region <REGIAO_AWS>
aws eks update-kubeconfig --region <REGIAO_AWS> --name <NOME_EKS> --alias <ALIAS_DEV>
kubectl config use-context <ALIAS_DEV>
```

**Atenção:** confirme sempre `kubectl config current-context` e namespace antes de aplicar YAMLs ou SQL, principalmente em UAT/PROD.

Scripts incluídos:

```powershell
.\scripts\eks-mysql-access\diagnostico-mysql.ps1 -Namespace $NS
```

### Bash / Linux

```bash
kubectl config current-context
kubectl get svc -A | grep rabbitmq-monitor-mysql
NS='<NAMESPACE_DEV>'
kubectl -n "$NS" get sts,svc,pod -l app=rabbitmq-monitor-mysql -o wide
kubectl -n "$NS" get endpointslice -l kubernetes.io/service-name=rabbitmq-monitor-mysql
```

> A consulta por label (`-l`) exige labels presentes nas respectivas entidades; se não aparecerem todos os objetos, use os comandos por nome do PowerShell acima.

## 2. OPÇÃO A — `kubectl port-forward` (recomendada para começar)

Não exige criação de `Service`, novas permissões AWS, rede VPC direta nem reinício do MySQL.

```powershell
$NS = '<NAMESPACE_DEV>'
kubectl -n $NS port-forward svc/rabbitmq-monitor-mysql 3307:3306
```

Ou use o script, na raiz do repositório:

```powershell
.\scripts\eks-mysql-access\port-forward-mysql.ps1 -Namespace $NS -LocalPort 3307
```

Bash:

```bash
./scripts/eks-mysql-access/port-forward-mysql.sh "$NS" 3307
```

O terminal permanece ativo enquanto houver acesso. No DBeaver, Workbench ou HeidiSQL:

- Host: `127.0.0.1`
- Porta: `3307`
- Banco: `rabbitmq_monitor_portal`
- Usuário: credencial de banco configurada no portal, por exemplo `app`; para DDL use um usuário com privilégios de migração
- Senha: credencial correspondente, sem registrá-la no YAML

Verifique antes:

```powershell
Test-NetConnection 127.0.0.1 -Port 3307
```

Se a porta local estiver ocupada, substitua `3307` por `3308` no comando e no cliente. Se o Service não possui endpoints prontos, valide `kubectl get pods` e `kubectl get endpointslice`.

**Opcional, a partir de uma máquina com `kubectl`, permitir acesso a partir de outro desktop corporativo:**

```powershell
kubectl -n $NS port-forward --address 0.0.0.0 svc/rabbitmq-monitor-mysql 3307:3306
```

O segundo desktop usa `IP_DA_MAQUINA_COM_KUBECTL:3307`; depende do firewall local e rota. Use para sessão controlada, não como endpoint permanente.

## 3. OPÇÃO B — consultar diretamente no pod MySQL

```powershell
$NS = '<NAMESPACE_DEV>'
kubectl -n $NS get pod rabbitmq-monitor-mysql-0
kubectl -n $NS exec -it rabbitmq-monitor-mysql-0 -- sh -c 'mysql -u"$MYSQL_USER" -p "$MYSQL_DATABASE"'
```

O cliente solicitará a senha (consulte a configuração já administrada do ambiente). Para backup, prefira executar pelo cliente MySQL remoto com dump e confirmar a cópia/restauração antes de aplicar os patches. **Nenhum passo neste guia elimina dados.**

## 4. OPÇÃO C — novo Service NodePort (rápido, rede privada)

Arquivo: `infra/kubernetes/mysql-access/mysql-nodeport-dev.yaml`.

O Service existente continua `ClusterIP`. O novo Service usa o mesmo seletor dos Pods MySQL e abre `31306` nos nós:

```powershell
$NS = '<NAMESPACE_DEV>'
kubectl get svc -A -o wide | Select-String '31306|rabbitmq-monitor-mysql'
kubectl -n $NS apply -f infra/kubernetes/mysql-access/mysql-nodeport-dev.yaml
kubectl -n $NS get svc rabbitmq-monitor-mysql-nodeport -o wide
kubectl get nodes -o wide
```

Conexão no DBeaver:

- Host: **IP privado** de um nó worker com caminho de rede a partir do desktop
- Porta: `31306`
- Banco/usuário/senha: mesmos do MySQL existente

PowerShell para teste (ajuste IP):

```powershell
Test-NetConnection <IP_PRIVADO_DO_NODE> -Port 31306
```

Requisitos: IP privado de um worker alcançável pela rede da empresa, porta admitida pelo security group do worker, regras de rede e NodePort habilitado. Em nós Fargate ou topologias sem acesso aos IPs dos workers, escolha NLB com destino IP em vez de NodePort. Para trocar `31306`, altere `nodePort` para uma porta permitida e não utilizada (faixa normalmente 30000–32767).

Remover **só o Service adicional**, sem tocar no banco:

```powershell
kubectl -n $NS delete svc rabbitmq-monitor-mysql-nodeport
```

## 5. OPÇÃO D — NLB interno com DNS dedicado (melhor para acesso recorrente)

### D1. Identificar o mecanismo de LoadBalancer ativo

```powershell
kubectl -n kube-system get deploy aws-load-balancer-controller --ignore-not-found
kubectl get ingress -A
kubectl get ingressclass
kubectl get svc -A -o wide
```

Se a empresa usa AWS CLI com permissão ELBv2:

```powershell
aws elbv2 describe-load-balancers --region <REGIAO_AWS> --query 'LoadBalancers[*].[LoadBalancerName,Type,Scheme,DNSName]' --output table
```

- **AWS Load Balancer Controller**: use `mysql-nlb-internal-aws-controller.yaml`.
- **EKS Auto Mode**: use `mysql-nlb-internal-eks-auto-mode.yaml`.
- Não aplique ambos. O Service chama-se `rabbitmq-monitor-mysql-nlb` nos dois exemplos.
- No `AWS Load Balancer Controller`, o alvo `ip` entrega diretamente ao Pod via VPC CNI; se necessário, altere para `instance` seguindo as regras do cluster (e alocação de NodePort).

### D2. Criar NLB interno

Com AWS Load Balancer Controller:

```powershell
$NS = '<NAMESPACE_DEV>'
kubectl -n $NS apply -f infra/kubernetes/mysql-access/mysql-nlb-internal-aws-controller.yaml
kubectl -n $NS describe svc rabbitmq-monitor-mysql-nlb
kubectl -n $NS get svc rabbitmq-monitor-mysql-nlb -w
```

Com EKS Auto Mode, **em vez do comando anterior**:

```powershell
kubectl -n $NS apply -f infra/kubernetes/mysql-access/mysql-nlb-internal-eks-auto-mode.yaml
kubectl -n $NS describe svc rabbitmq-monitor-mysql-nlb
kubectl -n $NS get svc rabbitmq-monitor-mysql-nlb -w
```

Obter o DNS atribuído:

```powershell
kubectl -n $NS get svc rabbitmq-monitor-mysql-nlb -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

O provisionamento depende das subnets privadas identificadas, tags de subnet, IAM do controlador e security groups/regras de rota. Se o EXTERNAL-IP ficar `pending`, veja `kubectl describe svc` e logs do controlador.

### D3. DNS para o MySQL

Crie um registro no DNS privado corporativo, por exemplo:

```text
mysql-monitor-dev.empresa.local.  IN  CNAME  internal-XXXX.elb.amazonaws.com.
```

Esse registro **deve apontar para o DNS do NLB TCP**, e **não** para o ALB HTTP(S) do portal. Se a zona estiver em Route 53 privado, use um alias para o NLB, quando apropriado; para DNS corporativo comum, um CNAME resolve a necessidade. O desktop precisa alcançar os IPs privados do NLB por rota corporativa/VPN.

Conecte em `mysql-monitor-dev.empresa.local:3306`.

Teste DNS/rede:

```powershell
Resolve-DnsName mysql-monitor-dev.empresa.local
Test-NetConnection mysql-monitor-dev.empresa.local -Port 3306
```

Para UAT e PROD, adapte o **namespace/contexto/DNS** (`mysql-monitor-uat.*`, `mysql-monitor-prod.*`), mantendo separados os Services e NLBs de cada ambiente.

Remover **somente o LoadBalancer Service adicional** (o controlador também remove o NLB sob sua gestão):

```powershell
kubectl -n $NS delete svc rabbitmq-monitor-mysql-nlb
```

### D4. Reaproveitar um NLB existente

Se os 'ALBs' citados na infraestrutura forem na verdade NLBs (confirme o campo `Type` pelo AWS CLI), é tecnicamente possível acrescentar um listener TCP 3306 e um target group apontando para os destinos do MySQL. Entretanto, esse processo não é equivalente a criar um Ingress HTTP: é necessário gerenciar listener, target group, health checks, IPs/porta dos Pods ou NodePort, e reconciliação durante recriação de Pods. **Prefira o Service LoadBalancer gerenciado pelo Kubernetes**, que mantém o registro de destinos correto.

## 6. OPÇÃO E — jump host / bastion / túnel SSH / SSM

Se há acesso SSH a um host na rede EKS e esse host possui `kubectl`, execute nele o `port-forward` para `127.0.0.1:3307`, e do seu desktop abra um túnel:

```bash
# no bastion que possui kubectl:
kubectl -n <NAMESPACE_DEV> port-forward svc/rabbitmq-monitor-mysql 3307:3306

# no desktop (outro terminal):
ssh -N -L 3307:127.0.0.1:3307 USUARIO@BASTION
```

No desktop, acesse `127.0.0.1:3307`. Se o bastion já alcança um NLB interno, não precisa de `kubectl` no bastion: use `ssh -N -L 3307:DNS_NLB:3306 USUARIO@BASTION`.

Se usam AWS Systems Manager Session Manager, é possível usar um salto SSM em uma instância que tenha conectividade ao NLB interno. Isso depende de uma instância SSM gerenciada e de permissões `ssm:StartSession`; o documento `AWS-StartPortForwardingSessionToRemoteHost` pode direcionar a `DNS_NLB:3306`. Não aponte diretamente o bastion para `.svc.cluster.local` a menos que o DNS e a rota internos estejam configurados para isso.

## 7. OPÇÃO F — Ingress Controller com TCP/stream

Um controlador NGINX, HAProxy ou Envoy **explicitamente configurado para encaminhar TCP** pode aceitar MySQL:3306 e encaminhar ao Service Kubernetes. Não confunda com AWS ALB/Ingress HTTP, que não oferece roteamento por hostname para tráfego MySQL. Dependendo do controlador, exige entrada `tcp-services`/`stream`, listener de LoadBalancer TCP e porta publicada no respectivo Service. Como esse recurso depende da implementação corporativa e pode afetar a instância atual do controlador, **nenhum arquivo deste pacote altera os Ingresses 80/443 em uso**.

## 8. Diagnóstico e troubleshooting

```powershell
$NS = '<NAMESPACE_DEV>'
kubectl -n $NS get svc rabbitmq-monitor-mysql -o yaml
kubectl -n $NS get endpointslice -l kubernetes.io/service-name=rabbitmq-monitor-mysql
kubectl -n $NS get pod rabbitmq-monitor-mysql-0 -o wide
kubectl -n $NS describe pod rabbitmq-monitor-mysql-0
kubectl -n $NS logs rabbitmq-monitor-mysql-0 --tail=100
kubectl -n $NS get events --sort-by=.lastTimestamp
kubectl -n $NS describe svc rabbitmq-monitor-mysql-nlb
```

- **`port-forward` não inicia:** verifique contexto, namespace, Service, endpoints, pod `Ready`, RBAC `create pods/portforward` e porta 3307 já ocupada.
- **`NodePort` não conecta:** teste o IP privado de um nó ativo, SG/ACL, porta 31306, endpoint pronto, rota entre computador e VPC; a visibilidade do DNS EKS não garante acesso TCP a workers.
- **`LoadBalancer` em `<pending>`:** controle de LB, subnets/tags, IAM, classe de LB escolhida e eventos do Service.
- **DNS NLB resolve, mas porta fecha:** rota, security groups, health check do target group, listeners TCP/3306 e endpoints pod.
- **`Access denied` MySQL:** conectividade está funcionando; reveja usuário, senha, permissões de origem e privilégios de DDL. O `MYSQL_USER` criado pelo container não implica privilégio DDL suficiente para todas as migrações.

## 9. Checklist DEV → UAT → PROD

1. Em DEV: confirme `kubectl context`, o StatefulSet, o Service `ClusterIP` e o PVC, e faça backup lógico/snapshot testado.
2. Teste port-forward e conexão pelo cliente; se precisar DNS permanente, crie **um Service NLB adicional** e DNS interno por ambiente.
3. Execute o `DIAGNOSTICO_V054_PARA_V0564.sql` em cada base antes de atualizar. Revise o esquema efetivo e patches parciais.
4. Em janela controlada, pause writers, aplique os patches *uma única vez* e confirme contagens e integridade antes de subir os novos pods. Não use `kubectl delete pvc`, `helm uninstall` ou `kubectl delete sts` para publicar acesso.
5. Após DEV validado, replique a técnica em UAT e PROD alterando apenas contexto, namespace, DNS e eventuais parâmetros de rede, mantendo os StatefulSets e Services de aplicação originais.

### Fontes de referência

- Kubernetes Service: https://kubernetes.io/docs/concepts/services-networking/service/
- Kubernetes port-forward: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/
- Amazon EKS — NLB: https://docs.aws.amazon.com/eks/latest/userguide/network-load-balancing.html
- Amazon EKS Auto Mode — NLB: https://docs.aws.amazon.com/eks/latest/userguide/auto-configure-nlb.html
- AWS ALB / NLB: https://aws.amazon.com/elasticloadbalancing/features/
