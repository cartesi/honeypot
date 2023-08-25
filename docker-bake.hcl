
variable "TAG" {
  default = "devel"
}

variable "DOCKER_ORGANIZATION" {
  default = "cartesi"
}

group "default" {
  targets = ["server", "console"]
}



target "wrapped" {
  context = "./docker"
  target = "wrapped-stage"
  contexts = {
    dapp = "target:dapp"
  }
}

target "fs" {
  context = "./docker"
  target  = "fs-stage"
  contexts = {
    wrapped = "target:wrapped"
  }
}

target "server" {
  context = "./docker"
  target  = "server-stage"
  contexts = {
    fs = "target:fs"
  }
  tags = ["${DOCKER_ORGANIZATION}/honeypot:${TAG}-server"]
}

target "console" {
  context = "./docker"
  target  = "console-stage"
  contexts = {
    fs = "target:fs"
  }
  tags = ["${DOCKER_ORGANIZATION}/honeypot:${TAG}-console"]
}

target "machine" {
  context = "./docker"
  target  = "machine-stage"
   contexts = {
    fs = "target:fs"
  }
  tags = ["${DOCKER_ORGANIZATION}/honeypot:${TAG}-machine"]
}

target "dapp" {
}
