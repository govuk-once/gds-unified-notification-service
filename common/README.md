NX commands 

- Install nx packages:  npm install -D @nx/node   
- Setup your nx: npx nx init   
- Now create a mono repo, this example is to create a healthcheck repo within the common folder: npx nx generate @nx/node:application common/healthcheck --framework=none
- Run all buils: npx nx run-many -t build    
- Start a selected nano repo: npx nx serve {nano repo name} 
- Display relationships between each service: npx nx graph                                                                                       
