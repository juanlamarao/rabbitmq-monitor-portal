# Uso: .\scripts\eks-mysql-access\port-forward-mysql.ps1 -Namespace <namespace> [-LocalPort 3307]
# O processo precisa continuar aberto enquanto o DBeaver/Workbench estiver conectado.
param(
  [Parameter(Mandatory=$true)][string]$Namespace,
  [ValidateRange(1024,65535)][int]$LocalPort = 3307,
  [string]$Service = 'rabbitmq-monitor-mysql'
)
$ErrorActionPreference = 'Stop'
$context = kubectl config current-context
if ($LASTEXITCODE -ne 0) { throw 'kubectl não conseguiu localizar o contexto atual.' }
Write-Host "Contexto: $context; namespace: $Namespace" -ForegroundColor Cyan
kubectl -n $Namespace get svc $Service
if ($LASTEXITCODE -ne 0) { throw "Service $Service não encontrado no namespace $Namespace." }
Write-Host "Conecte-se pelo MySQL em 127.0.0.1:$LocalPort (Ctrl+C para encerrar)." -ForegroundColor Green
kubectl -n $Namespace port-forward "svc/$Service" "${LocalPort}:3306"
