
variable "TAG" {
  default = "devel"
}

variable "DOCKER_ORGANIZATION" {
  default = "cartesi"
}

group "default" {
  targets = ["dapp", "server", "console"]
}

target "local-deployments" {
  context = "./docker"
  target = "local-deployments-stage"
}

target "deployments" {
  context = "./docker"
  target = "deployments-stage"
}

target "fs" {
  context = "./docker"
  target  = "fs-stage"
  contexts = {
    dapp = "target:dapp"
    deployments = "target:deployments"
    local-deployments = "target:local-deployments"
  }
}

target "server" {
  context = "./docker"
  target  = "server-stage"
  contexts = {
    fs = "target:fs"
  }
  tags = ["${DOCKER_ORGANIZATION}/dapp:honeypot-${TAG}-server"]
}

target "console" {
  context = "./docker"
  target  = "console-stage"
  contexts = {
    fs = "target:fs"
  }
  tags = ["${DOCKER_ORGANIZATION}/dapp:honeypot-${TAG}-console"]
}

target "machine" {
  context = "./docker"
  target  = "machine-stage"
  contexts = {
    server = "target:server"
  }
  tags = ["${DOCKER_ORGANIZATION}/dapp:honeypot-${TAG}-machine"]
}

target "dapp" {
}
