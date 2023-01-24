# Tests

Before running the tests, make sure the local environment is up and running, as explained in the [Honeypot DApp documentation](../README.md#running-the-application).

With all set, proceed as explained below.

## Update git submodules

From the project root directory, execute:

```shell
git submodule update --init
```

## Download modules and build test code

```shell
yarn && yarn build
```

## Run the tests

```shell
yarn test
```

For more information regarding the project scripts, refer to [package.json](./package.json).
