# Monitor Portal v0.5.6.5 — Hotfix de interface e acesso MySQL no EKS

**Base:** v0.5.6.4. **Compatível:** Docker Compose e EKS (DEV/UAT/PROD).

## Alterações frontend (somente cinco páginas)

1. `frontend/src/pages/AppearancePage.tsx` — removida a nota de persistência do layout no MySQL e Audit Log.
2. `frontend/src/pages/DatadogSyncPage.tsx` — removida a nota sobre ausência do botão de sincronização.
3. `frontend/src/pages/ReportsPage.tsx` — removida a nota explicativa sobre CSV/PDF e consultas MySQL. Os formatos e limites de exportação permanecem operacionais.
4. `frontend/src/pages/AuditLogPage.tsx` — trocado **apenas o Grid dos filtros** por CSS Grid responsivo local, sem margens negativas e com `gap` consistente. Foram mantidos labels, handlers, alturas, controles, API e layout da tabela.
5. `frontend/src/pages/PublicQueueReferencePage.tsx` — removido o card isolado de Cluster/Vhost. Abaixo do nome da fila agora aparece `Cluster: ... · Vhost: ...`; eventual status `Queue removida` é exibido no cabeçalho.

## Acesso MySQL EKS (arquivos novos; não alteram manifestos já publicados)

- `ACESSO_MYSQL_EKS_DEV_UAT_PROD.md`: guia com port-forward, `kubectl exec`, NodePort, NLB interno, DNS CNAME/Route 53, bastion/SSH/SSM, Ingress TCP e troubleshooting.
- `infra/kubernetes/mysql-access/mysql-nodeport-dev.yaml`: Service adicional tipo NodePort, `31306`.
- `infra/kubernetes/mysql-access/mysql-nlb-internal-aws-controller.yaml`: Service adicional tipo LoadBalancer para AWS Load Balancer Controller.
- `infra/kubernetes/mysql-access/mysql-nlb-internal-eks-auto-mode.yaml`: Service adicional tipo LoadBalancer para EKS Auto Mode.
- `scripts/eks-mysql-access/diagnostico-mysql.ps1`: verifica contexto, serviços, StatefulSet, endpoints, nós e controlador.
- `scripts/eks-mysql-access/port-forward-mysql.ps1`: abre `127.0.0.1:3307` via kubectl.
- `scripts/eks-mysql-access/port-forward-mysql.sh`: alternativa Linux/Bash.

**Nenhum script de acesso ao banco executa SQL, modifica PVC, recria StatefulSet ou altera o Service ClusterIP existente.** Somente a aplicação voluntária de um dos YAMLs adicionais cria um Service externo à aplicação.

## Implantação

### Local

Após copiar o patch sobre a v0.5.6.4:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build --no-deps rabbitmq-monitor-frontend
```

### EKS

Publicar **somente uma nova imagem frontend** `ImageName1` e atualizar o Deployment frontend pelo pipeline corporativo habitual. Não é necessário reconstruir `ImageName2`, aplicar migração SQL ou alterar os manifestos Kubernetes principais nesta revisão.

Para acesso ao MySQL, leia `ACESSO_MYSQL_EKS_DEV_UAT_PROD.md` e escolha um método. **Port-forward não altera recursos Kubernetes.**

## Verificação

- Validar Audit Logs com sidebar expandida/retraída em resoluções desktop e tablet, sem mexer nos demais filtros.
- Validar página pública com vhost `/`, com nomes longos e com `is_removed=true`.
- Confirmar que os três textos não aparecem mais.
- Validar o DNS do NLB privado separadamente (se for criado) e não usar ALB HTTP/HTTPS para MySQL.

## Limitações da validação realizada

Foi feita verificação estática do frontend, arquivos YAML e arquivos de patch. Nenhum pod EKS real foi acessado, nenhuma imagem foi construída e nenhuma alteração foi aplicada em banco corporativo neste ambiente de geração.
