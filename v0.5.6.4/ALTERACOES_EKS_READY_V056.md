# Alterações sobre o pacote v0.5.6 local anterior

Arquivos modificados:

- `kubernetes.dev.yaml`: Deployment `rabbitmq-monitor-sync-dispatcher` usando `ImageName2` e `wait-mysql-schema`.
- `kubernetes.uat.yaml`: mesmo Deployment com `APP_ENV=uat`.
- `kubernetes.prod.yaml`: mesmo Deployment com `APP_ENV=production`.
- `docker-compose.local.yml`: dois envs explícitos de sync para manter paridade com EKS.
- `INSTALAR_LOCAL_V056.md`: referência ao deploy EKS e nova arquitetura.
- `ARQUIVOS_V056.md`: relação de mudanças atualizada.
- `README.md`: indicação de paridade local/EKS.

Arquivo novo:
- `DEPLOY_EKS_V056.md`: migração, implantação e verificação no EKS.

Nenhum código Python/React, Dockerfile, nome de workload existente ou SQL foi modificado. O SQL 009 já fazia parte do pacote original e é obrigatório antes do deploy EKS.
