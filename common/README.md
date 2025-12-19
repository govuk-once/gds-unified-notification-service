NX commands 

- Install nx packages:  npm install -D @nx/node   
- Setup your nx: npx nx init   
- Now create a mono repo, this example is to create a healthcheck repo within the coomon folder: npx nx generate @nx/node:application common/healthcheck --framework=none
