![alt tag](https://github.com/pesfandiar/Phonjour/blob/master/public/images/logo-large.png)

Phonjour is a web application with simple phone automation features. I'm open sourcing this side project (read [the blog post here](http://www.pesfandiar.com/blog/2016/02/06/open-sourcing-my-nodejs-app)). Please feel free to extend it, deploy it, or use it as a boilerplate for another web applications.

In order to run:
* Copy .example files to their example-less name (including SSL and RSA files), and populate.
* Set NODE_ENV variable to 'development' or 'production'
* Set STAGING variable to any non-empty string for a staging environment
* The server listens to port 3000 for HTTPS by default, you can redirect it using (not recommended for production):
    "sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-port 3000"
* The server also listens to port 3001 for HTTP by default. It will be automatically redirected to HTTPS. You can use this command (not recommended for production):
    "sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 3001"
* Configure the config.js file for your needs
* Update the email addresses, link to the explainer video, and contact info on the landing page
