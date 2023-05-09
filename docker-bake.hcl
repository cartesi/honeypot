
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
}

target "console" {
  context = "./docker"
  target  = "console-stage"
  contexts = {
    fs = "target:fs"
  }
}

target "machine" {
  context = "./docker"
  target  = "machine-stage"
  contexts = {
    server = "target:server"
  }
}
