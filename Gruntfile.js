module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      //define files to lint
      files: ['js/**.js','js/views/**/*.js','!js/text.js','!js/libs'],
      //configure JSHint
      options: {
        globals: {
          jQuery: true,
          console: true,
          module: true
        }
      }
    },
    requirejs: {
      compile: {
        options: {
          baseUrl: 'js',
          name: 'main',
          mainConfigFile: 'js/main.js',
          out: 'dist/js/main.js'
        }
      }
    },
    cssmin: {
      combine: {
        options: {
          banner: '/*! <%= pkg.name %> <% grunt.template.today("dd-mm-yyyy") %> */\n'
        },
        files: {
          'dist/css/styles.css': [
            'css/custom.css',
            'js/libs/bootstrap/dist/css/bootstrap_superhero.css',
            'js/libs/bootstrap-switch/dist/css/bootstrap3/bootstrap-switch.css'
          ]
        }
      }
    },
    watch: {
      scripts: {
        files: ['<%= jshint.files %>'],
        tasks: ['jshint']
      }
    },
    notify: {
      build: {
        options: {
          title: 'Build status',
          message: 'JS and CSS build complete'
        }
      }
    },
    copy: {
      main: {
        files: [
          // includes files within path
          {
            expand: true,
            src: ['index.html','fonts/*','font/*','imgs/**','js/libs/requirejs/require.js'], 
            dest: 'dist/'
          }
        ]
      }
    },
    hashres: {
      // Global options
      options: {
        // Optional. Encoding used to read/write files. Default value 'utf8'
        encoding: 'utf8',
        // Optional. Format used to name the files specified in 'files' property.
        // Default value: '${hash}.${name}.cache.${ext}'
        fileNameFormat: '${hash}.${name}.cache.${ext}',
        // Optional. Should files be renamed or only alter the references to the files
        // Use it with '${name}.${ext}?${hash} to get perfect caching without renaming your files
        // Default value: true
        renameFiles: true
      },
      // hashres is a multitask. Here 'prod' is the name of the subtask. You can have as many as you want.
      prod: {
        // Specific options, override the global ones
        options: {
          // You can override encoding, fileNameFormat or renameFiles
        },
        // Files to hash
        src: [
          // WARNING: These files will be renamed!
          'dist/main.min.js'
        ],
        // File that refers to above files and needs to be updated with the hashed name
        dest: 'dist/index.html',
      },
      // hashres is a multitask. Here 'prod' is the name of the subtask. You can have as many as you want.
      prod_css: {
        // Specific options, override the global ones
        options: {
          // You can override encoding, fileNameFormat or renameFiles
        },
        // Files to hash
        src: [
          // WARNING: These files will be renamed!
          'dist/js/main.js',
          'dist/css/styles.css'],
        // File that refers to above files and needs to be updated with the hashed name
        dest: 'dist/index.html',
      }
    },
    //remove files in dist folder
    clean: {
      build: {
        src: ["dist/*"]
      }
    },
    rsync: {
      staging_deploy: {
        files: 'dist/',
        options: {
          host      : "tbd",
          user      : "deploy",
          remoteBase: "/srv/website",
          clean     : true
        }
      },
      production_deploy: {
        files: 'dist/',
        options: {
          host      : "livelist.ericvierhaus.com",
          user      : "deploy",
          remoteBase: "/srv/live_list_website"
        }
      }
    },


  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-requirejs');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-notify');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-hashres');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-rsync-2');

  grunt.registerTask('default', ['jshint','notify:build']);
  grunt.registerTask('staging_deploy', ['clean:build','requirejs','cssmin','copy','hashres:prod_css','rsync:staging_deploy','notify:build']);
  grunt.registerTask('production_deploy', ['clean:build','requirejs','cssmin','copy','hashres:prod_css','rsync:production_deploy','notify:build']);
  grunt.registerTask('build_css', ['requirejs','cssmin','notify:build']);
  grunt.registerTask('build', ['clean:build','requirejs','cssmin','notify:build','copy','hashres:prod_css']);
  // grunt.registerTask('sync_staging',['rsync:deploy_staging']);
  // grunt.registerTask('sync_production',['rsync:deploy_production']);
}