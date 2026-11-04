# Uso: .\scripts\eks-mysql-access\diagnostico-mysql.ps1 [-Namespace <namespace>]
param([string]$Namespace = '')
$ErrorActionPreference = 'Stop'
Write-Host '== Contexto Kubernetes ==' -ForegroundColor Cyan
kubectl config current-context
Write-Host '== Serviços MySQL nos namespaces ==' -ForegroundColor Cyan
kubectl get svc -A | Select-String 'NAMESPACE|rabbitmq-monitor-mysql'
if ($Namespace) {
  Write-Host "== Verificação no namespace $Namespace ==" -ForegroundColor Cyan
  kubectl -n $Namespace get sts rabbitmq-monitor-mysql -o wide
  kubectl -n $Namespace get svc rabbitmq-monitor-mysql -o wide
  kubectl -n $Namespace get pods -l app=rabbitmq-monitor-mysql -o wide
  kubectl -n $Namespace get endpointslice -l kubernetes.io/service-name=rabbitmq-monitor-mysql
}
Write-Host '== Serviços expostos e ingressos ==' -ForegroundColor Cyan
kubectl get svc -A -o wide
kubectl get ingress -A
Write-Host '== Controller NLB (se existir) ==' -ForegroundColor Cyan
kubectl -n kube-system get deploy aws-load-balancer-controller --ignore-not-found
Write-Host '== Nós privados para NodePort ==' -ForegroundColor Cyan
kubectl get nodes -o wide
