// Require.js allows us to configure shortcut alias
// Their usage will become more apparent futher along in the tutorial.
require.config({
  waitSeconds: 200,
  paths: {
    jquery: 'libs/jquery/dist/jquery',
    jqueryui: 'libs/jqueryui/ui/jquery-ui',
    backbone: 'libs/backbone-amd/backbone',
    underscore: 'libs/underscore-amd/underscore',
    marionette: 'libs/marionette/lib/core/amd/backbone.marionette',
    'backbone.wreqr' : 'libs/backbone.wreqr/lib/amd/backbone.wreqr',
    'backbone.babysitter' : 'libs/backbone.babysitter/lib/amd/backbone.babysitter',
    bootstrap: 'libs/bootstrap/dist/js/bootstrap',
    'backbone.collectionView' : 'libs/backbone.collectionView/dist/backbone.collectionView',
    nestable : 'libs/nestable/jquery.nestable',
    modernizr: 'libs/modernizr/modernizr',
    autosize: 'libs/jquery-autosize/jquery.autosize',
    templates: '../templates'
  },
  shim: {
    'bootstrap' : ['jquery'],
    'backbone.collectionView' : ['backbone'],
    'nestable' : ['jquery'],
    'modernizr' : ['jquery'],
    'autosize' : ['jquery']
  }

});

require([
  // Load our app module and pass it to our definition function
  'app','jquery','bootstrap'

], function(App){

  //TODO: Understand why this command does not work. It always returns a Uncaught TypeError: Cannot call method 'start' of undefined error. But if I put app.start() in app.js it works.
  // return App.start();


});